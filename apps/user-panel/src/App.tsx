import { useEffect, useState } from 'react';
import {
  AuthResponse,
  ConversationDto,
  IframeMode,
  LineDto,
  MessageDto,
  MessengerType,
} from '@fintech/shared';
import { io, Socket } from 'socket.io-client';
import {
  API_URL,
  fetchConversations,
  fetchLines,
  fetchMessages,
  iframeAuth,
  readIframeParams,
  sendMessage,
  sendFileMessage,
  startConversation,
} from './api';
import { ChatComposer } from './components/ChatComposer';
import { ChatHeader } from './components/ChatHeader';
import { ChatMessageList } from './components/ChatMessageList';
import { ConversationSidebar } from './components/ConversationSidebar';
import { MessengerRail } from './components/MessengerRail';
import { messengerMeta } from './components/MessengerIcon';
import { formatClientSubtitle, formatClientTitle, resolveClientContext } from './utils/client';

function messengerLabel(type: MessengerType) {
  return messengerMeta[type].label;
}

function EmptyChatPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center chat-wallpaper">
      <div className="mb-5 h-24 w-24 rounded-full bg-[var(--tg-sidebar)] flex items-center justify-center shadow-lg">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-[var(--tg-accent)]" aria-hidden>
          <path
            d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-[15px] text-[var(--tg-text-secondary)] max-w-xs leading-relaxed">{text}</p>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<LineDto[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextMessageCursor, setNextMessageCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const contactMode = auth?.mode === IframeMode.CONTACT;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) ?? null;
  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? null;
  const clientTitle = formatClientTitle(auth, selectedConversation);
  const clientSubtitle = formatClientSubtitle(auth, selectedConversation);

  useEffect(() => {
    (async () => {
      try {
        const params = readIframeParams();
        const session = await iframeAuth(params);
        setAuth(session);

        const allLines = await fetchLines(session.token);
        setLines(allLines);

        if (session.mode === IframeMode.CONTACT) {
          const contactConversations = await fetchConversations(session.token, {
            contactId: session.contact?.bitrixContactId,
            contactPhone: session.contact?.phone ?? undefined,
          });
          setConversations(contactConversations);
          if (contactConversations.length) {
            setSelectedConversationId(contactConversations[0].id);
            setSelectedLineId(contactConversations[0].lineId);
          } else if (allLines.length) {
            setSelectedLineId(allLines[0].id);
          }
        } else if (allLines.length) {
          setSelectedLineId(allLines[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auth failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!auth || contactMode || !selectedLineId) return;

    fetchConversations(auth.token, { lineId: selectedLineId })
      .then(setConversations)
      .catch((err) => setError(err.message));
  }, [auth, selectedLineId, contactMode]);

  useEffect(() => {
    if (!auth || !selectedConversationId) {
      setMessages([]);
      setHasMoreMessages(false);
      setNextMessageCursor(null);
      return;
    }

    fetchMessages(auth.token, selectedConversationId, 50)
      .then((res) => {
        setMessages(res.messages);
        setHasMoreMessages(res.hasMore);
        setNextMessageCursor(res.nextCursor);
      })
      .catch((err) => setError(err.message));
  }, [auth, selectedConversationId]);

  const handleLoadMoreMessages = async () => {
    if (!auth || !selectedConversationId || !nextMessageCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await fetchMessages(auth.token, selectedConversationId, 50, nextMessageCursor);
      setMessages((prev) => [...prev, ...res.messages]);
      setHasMoreMessages(res.hasMore);
      setNextMessageCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!auth?.token) return;

    const socket: Socket = io(`${API_URL}/ws`, {
      auth: { token: auth.token },
    });

    socket.on('message:new', (payload: { lineId: string; message: MessageDto }) => {
      if (payload.message.conversationId === selectedConversationId) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === payload.message.id)) {
            return prev.map((item) => item.id === payload.message.id ? payload.message : item);
          }
          return [payload.message, ...prev];
        });
      }

      setConversations((prev) =>
        prev
          .map((item) =>
            item.id === payload.message.conversationId
              ? {
                  ...item,
                  lastMessageAt: payload.message.createdAt,
                  lastMessagePreview: payload.message.body,
                }
              : item,
          )
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
          ),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [auth?.token, selectedConversationId]);

  async function handleFileSelect(file: File) {
    if (!auth || uploading || sending) return;

    setUploading(true);
    setError(null);
    try {
      let conversationId = selectedConversationId;

      if (!conversationId && contactMode && selectedLine) {
        const { phone } = resolveClientContext(auth, null);
        if (!phone) {
          throw new Error('Не указан телефон клиента');
        }

        const result = await startConversation(auth.token, {
          lineId: selectedLine.id,
          contactPhone: phone,
          contactName: auth.contact?.name ?? undefined,
          bitrixContactId: auth.contact?.bitrixContactId,
        });

        setConversations((prev) => [
          result.conversation,
          ...prev.filter((item) => item.id !== result.conversation.id),
        ]);
        conversationId = result.conversation.id;
        setSelectedConversationId(conversationId);
        if (result.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.message!.id)) return prev;
            return [result.message!, ...prev];
          });
        }
      }

      if (!conversationId) {
        throw new Error('Сначала выберите диалог');
      }

      const message = await sendFileMessage(
        auth.token,
        conversationId,
        file,
        draft.trim() || undefined,
      );
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [message, ...prev];
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    if (!auth || !draft.trim() || sending) return;

    setSending(true);
    setError(null);
    try {
      if (selectedConversationId) {
        const message = await sendMessage(auth.token, selectedConversationId, draft.trim());
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [message, ...prev];
        });
      } else if (contactMode && selectedLine) {
        const { phone } = resolveClientContext(auth, null);
        if (!phone) {
          throw new Error('Не указан телефон клиента');
        }

        const result = await startConversation(auth.token, {
          lineId: selectedLine.id,
          contactPhone: phone,
          contactName: auth.contact?.name ?? undefined,
          bitrixContactId: auth.contact?.bitrixContactId,
          text: draft.trim(),
        });

        setConversations((prev) => [
          result.conversation,
          ...prev.filter((item) => item.id !== result.conversation.id),
        ]);
        setSelectedConversationId(result.conversation.id);
        if (result.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.message!.id)) return prev;
            return [...prev, result.message!];
          });
        }
      } else {
        return;
      }

      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function selectLine(lineId: string) {
    setSelectedLineId(lineId);
    if (contactMode) {
      const next = conversations.find((item) => item.lineId === lineId);
      setSelectedConversationId(next?.id ?? null);
    } else {
      setSelectedConversationId(null);
    }
  }

  function handleConversationSelect(id: string) {
    setSelectedConversationId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setSelectedLineId(conv.lineId);
    }
  }

  function renderChatPanel(showEmptyHint = false) {
    const linePhone = selectedLine?.wappiProfileId || 'Неизвестно';
    const clientPhone = selectedConversation?.contactPhone || auth?.contact?.phone || 'Неизвестно';

    return (
      <div className="flex h-full flex-1 flex-col min-w-0 chat-wallpaper">
        <ChatHeader
          title={clientTitle}
          subtitle={clientSubtitle || undefined}
          messengerType={selectedLine?.messengerType}
          bitrixContactId={selectedConversation?.bitrixContactId || auth?.contact?.bitrixContactId}
          domain={auth?.domain}
        />
        
        {/* Временный отладочный блок */}
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-2 text-xs text-yellow-600/80 text-center z-10">
          🛠 <b>Линия:</b> {linePhone} | <b>Клиент:</b> {clientPhone} {selectedConversation ? `| ID: ${selectedConversation.id}` : '| (Новый диалог)'}
        </div>

        <ChatMessageList
          messages={messages}
          token={auth?.token}
          emptyHint={
            showEmptyHint ? 'Напишите первое сообщение или прикрепите файл' : undefined
          }
          hasMore={hasMoreMessages}
          onLoadMore={handleLoadMoreMessages}
          isLoadingMore={isLoadingMore}
        />
        <ChatComposer
          draft={draft}
          sending={sending}
          uploading={uploading}
          error={error}
          onDraftChange={setDraft}
          onSend={handleSend}
          onFileSelect={handleFileSelect}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tg-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--tg-accent)] border-t-transparent animate-spin" />
          <span className="text-[14px] text-[var(--tg-text-secondary)]">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error && !auth) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tg-bg)] text-red-400 px-6 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--tg-bg)]">
      <MessengerRail
        lines={lines}
        selectedLineId={selectedLineId}
        onSelect={selectLine}
        activeLineIds={contactMode ? conversations.map(c => c.lineId) : undefined}
      />

      {!contactMode && auth && (
        <ConversationSidebar
          auth={auth}
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          selectedLineName={selectedLine?.name}
          formatTitle={(conversation) => formatClientTitle(auth, conversation)}
          onSelect={handleConversationSelect}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 h-full">
        {selectedConversation ? (
          renderChatPanel()
        ) : contactMode && selectedLine ? (
          renderChatPanel(true)
        ) : contactMode && !selectedLine ? (
          <EmptyChatPlaceholder
            text={`Линия не назначена`}
          />
        ) : (
          <EmptyChatPlaceholder text="Выберите диалог, чтобы начать переписку" />
        )}
      </main>
    </div>
  );
}
