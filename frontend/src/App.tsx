import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { CollaborationPage } from "./pages/CollaborationPage";
import { CodeExplorerPage } from "./pages/CodeExplorerPage";
import { SemanticSearchPage } from "./pages/SemanticSearchPage";
import { IntelligencePage } from "./pages/IntelligencePage";
import { CommitsPage } from "./pages/CommitsPage";
import { ChatPage } from "./pages/ChatPage";
import { PullRequestsPage } from "./pages/PullRequestsPage";
import { PullRequestDetailPage } from "./pages/PullRequestDetailPage";
import { SymbolsPage } from "./pages/SymbolsPage";
import { SecurityPage } from "./pages/SecurityPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* New URL scheme: /repo/:id */}
        <Route path="/repo/:id" element={<Dashboard />} />
        <Route path="/repo/:id/commits" element={<CommitsPage />} />
        <Route path="/repo/:id/branches" element={<Dashboard section="branches" />} />
        <Route path="/repo/:id/prs" element={<PullRequestsPage />} />
        <Route path="/repo/:id/prs/:prNumber" element={<PullRequestDetailPage />} />
        <Route path="/repo/:id/collaboration" element={<CollaborationPage />} />
        <Route path="/repo/:id/code" element={<CodeExplorerPage />} />
        <Route path="/repo/:id/symbols" element={<SymbolsPage />} />
        <Route path="/repo/:id/security" element={<SecurityPage />} />
        <Route path="/repo/:id/search" element={<SemanticSearchPage />} />
        <Route path="/repo/:id/chat" element={<ChatPage />} />
        <Route path="/repo/:id/intelligence" element={<IntelligencePage />} />

        {/* Legacy: redirect old /dashboard/:id to /repo/:id */}
        <Route path="/dashboard/:id" element={<LegacyRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function LegacyRedirect() {
  const { id } = useParams();
  return <Navigate to={`/repo/${id}`} replace />;
}
