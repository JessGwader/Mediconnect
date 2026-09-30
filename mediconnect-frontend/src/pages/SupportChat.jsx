import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import { useSocket } from "../context/SocketContext";
import { EmptyState, ErrorBanner } from "../components/ui";

export function SupportChat() {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const [topics, setTopics] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [myAlias, setMyAlias] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    apiFetch("/api/support-topics")
      .then((data) => { setTopics(data.topics); if (data.topics[0]) setActiveId(data.topics[0].id); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadMessages(topicId) {
    try {
      const data = await apiFetch(`/api/support-topics/${topicId}/messages`);
      setMessages(data.messages);
      setMyAlias(data.myAlias);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);

  // Join the topic's real-time room while it's open — everyone currently
  // viewing this room sees new posts appear instantly.
  useEffect(() => {
    if (!socket || !activeId) return;
    socket.emit("join:support-topic", activeId);
    function onMessage(message) {
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [
        ...ms,
        { id: message.id, body: message.body, alias: message.alias, mine: message.alias === myAlias },
      ]));
    }
    socket.on("support-message", onMessage);
    return () => {
      socket.off("support-message", onMessage);
      socket.emit("leave:support-topic", activeId);
    };
  }, [socket, activeId, myAlias]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    try {
      await apiFetch(`/api/support-topics/${activeId}/messages`, { method: "POST", body: { body: draft.trim() } });
      setDraft("");
      // The socket listener appends the message in the common case; refetch
      // only as a fallback if the socket isn't connected.
      if (!socket?.connected) loadMessages(activeId);
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  const activeTopic = topics.find((topic) => topic.id === activeId);

  return (
    <div>
      <h2 className="page-title">{t("support.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--slate)", marginTop: -10, marginBottom: 16 }}>
        {t("support.intro")}
      </p>
      <ErrorBanner message={error} />
      {topics.length === 0 ? (
        <EmptyState>{t("support.no_rooms")}</EmptyState>
      ) : (
        <div className="chat-shell">
          <div className="chat-list">
            {topics.map((topic) => (
              <div key={topic.id} className={"chat-list-item" + (topic.id === activeId ? " active" : "")} onClick={() => setActiveId(topic.id)}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{topic.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--slate-dim)" }}>{topic.description}</div>
              </div>
            ))}
          </div>
          <div className="chat-thread">
            {activeTopic && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--slate-dim)", background: "var(--card)" }}>
                {t("support.posting_as", { alias: myAlias, topic: activeTopic.name })}
              </div>
            )}
            <div className="chat-messages">
              {messages.length === 0 && <p style={{ fontSize: 13, color: "var(--slate-dim)", textAlign: "center" }}>{t("support.no_messages_yet")}</p>}
              {messages.map((m) => (
                <div key={m.id} className={"chat-bubble " + (m.mine ? "mine" : "theirs")}>
                  {!m.mine && <div style={{ fontSize: 10.5, opacity: 0.7, marginBottom: 2 }}>{m.alias}</div>}
                  {m.body}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="chat-input-row">
              <input
                placeholder={t("support.share_placeholder")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="btn small" onClick={send}>{t("messages.send")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
