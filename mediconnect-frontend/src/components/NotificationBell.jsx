import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import { useSocket } from "../context/SocketContext";

export function NotificationBell() {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch("/api/notifications");
        if (!cancelled) setNotifications(data.notifications);
      } catch { /* non-critical */ }
    }
    load();
    // Polling stays as a fallback/resync even with the socket connected —
    // catches anything missed while the tab was backgrounded or briefly offline.
    const interval = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Real-time push: a new notification appears instantly instead of waiting
  // up to 20s for the next poll.
  useEffect(() => {
    if (!socket) return;
    function onNotification(notification) {
      setNotifications((ns) => [notification, ...ns.filter((n) => n.id !== notification.id)]);
    }
    socket.on("notification", onNotification);
    return () => socket.off("notification", onNotification);
  }, [socket]);

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const markRead = async (id) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch { /* ignore */ }
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)}>
        🔔{hasUnread && <span className="dot" />}
      </button>
      {open && (
        <div className="dropdown">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{t("notifications.title")}</div>
          {notifications.length === 0 && <div className="spinner-note">{t("notifications.none")}</div>}
          {notifications.slice(0, 12).map((n) => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                fontSize: 12.5, padding: "8px 6px", borderBottom: "1px solid var(--line)",
                cursor: n.read ? "default" : "pointer", opacity: n.read ? 0.6 : 1,
              }}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
