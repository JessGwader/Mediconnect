import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { EmptyState } from "./ui";

// Note: this only controls what the React app *renders*. The actual
// authorization boundary is server-side (requireAuth/requireRole in the
// backend) — this exists purely so logged-out or wrong-role users don't see
// a flash of UI they have no access to before an API call 403s.
export function ProtectedRoute({ children, roles }) {
  const { user, bootstrapping } = useAuth();

  if (bootstrapping) return <div style={{ padding: 40 }}><EmptyState>Loading MediConnect…</EmptyState></div>;
  if (!user) return <Navigate to="/welcome" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
