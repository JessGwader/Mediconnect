import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, apiDownload } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { EmptyState, ErrorBanner } from "../components/ui";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function Messages() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const isDoctor = user.role === "Doctor" || user.role === "Specialist";
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    apiFetch("/api/conversations")
      .then((data) => { setConversations(data.conversations); if (data.conversations[0]) setActiveId(data.conversations[0].id); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    apiFetch(`/api/conversations/${activeId}/messages`)
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err.message));
  }, [activeId]);

  // Join the conversation's real-time room while it's open, so both sides
  // see new messages appear instantly without waiting on a manual refetch.
  useEffect(() => {
    if (!socket || !activeId) return;
    socket.emit("join:conversation", activeId);
    function onMessage(message) {
      if (message.conversation_id !== activeId) return;
      setMessages((ms) => (ms.some((m) => m.id === message.id) ? ms : [...ms, message]));
    }
    socket.on("message", onMessage);
    return () => {
      socket.off("message", onMessage);
      socket.emit("leave:conversation", activeId);
    };
  }, [socket, activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    try {
      await apiFetch(`/api/conversations/${activeId}/messages`, { method: "POST", body: { body: draft.trim() } });
      setDraft("");
      // The socket listener above will append the message for us in the
      // common case; this refetch is just a safety net if the socket
      // is disconnected.
      if (!socket?.connected) {
        const data = await apiFetch(`/api/conversations/${activeId}/messages`);
        setMessages(data.messages);
      }
    } catch (err) { setError(err.message); }
  }

  async function sendAttachment(file) {
    if (!file || !activeId) return;
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { document } = await apiFetch(`/api/conversations/${activeId}/attachments`, { method: "POST", body: form, isForm: true });
      await apiFetch(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        body: { body: draft.trim() || null, attachmentDocumentId: document.id },
      });
      setDraft("");
      if (!socket?.connected) {
        const data = await apiFetch(`/api/conversations/${activeId}/messages`);
        setMessages(data.messages);
      }
    } catch (err) { setError(err.message); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function downloadAttachment(message) {
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv || !message.attachment_document_id) return;
    try {
      const blob = await apiDownload(`/api/patients/${conv.patient_id}/documents/${message.attachment_document_id}/download`);
      triggerDownload(blob, message.attachment_name || "attachment");
    } catch (err) { setError(err.message); }
  }

  if (loading) return <EmptyState>{t("common.loading")}</EmptyState>;

  return (
    <div>
      <h2 className="page-title">{t("messages.title")}</h2>
      <ErrorBanner message={error} />
      {conversations.length === 0 ? (
        <EmptyState>
          {isDoctor ? t("messages.no_conversations_doctor") : t("messages.no_conversations_patient")}
        </EmptyState>
      ) : (
        <div className="chat-shell">
          <div className="chat-list">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={"chat-list-item" + (c.id === activeId ? " active" : "")}
                onClick={() => setActiveId(c.id)}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{isDoctor ? c.patient_name : c.doctor_name}</div>
                <div style={{ fontSize: 12, color: "var(--slate-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.last_message || t("messages.no_messages_preview")}
                </div>
              </div>
            ))}
          </div>
          <div className="chat-thread">
            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={"chat-bubble " + (m.sender_id === user.id ? "mine" : "theirs")}>
                  {m.body}
                  {m.attachment_name && (
                    <div
                      style={{ fontSize: 11, marginTop: 4, opacity: 0.85, cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => downloadAttachment(m)}
                    >
                      📎 {m.attachment_name}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="chat-input-row">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => sendAttachment(e.target.files[0])}
                accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx"
              />
              <button
                type="button"
                className="btn ghost small"
                title={t("messages.attach_file")}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "…" : "📎"}
              </button>
              <input
                placeholder={t("messages.type_a_message")}
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
