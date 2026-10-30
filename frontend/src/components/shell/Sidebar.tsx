import { NavLink, useParams } from "react-router-dom";
import {
  GitGraph,
  GitBranch,
  Files,
  Eye,
  Code2,
  Search,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Users,
  Sparkles,
  Lock,
  TrendingUp,
  Bot,
  GitPullRequest,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  soon?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { id } = useParams();

  const groups: NavGroup[] = id
    ? [
        {
          title: "Overview",
          items: [
            { label: "Dashboard", to: `/repo/${id}`, icon: <LayoutDashboard size={15} /> },
          ],
        },
        {
          title: "Repository",
          items: [
            { label: "Commits", to: `/repo/${id}/commits`, icon: <GitGraph size={15} /> },
            { label: "Branches", to: `/repo/${id}/branches`, icon: <GitBranch size={15} /> },
            { label: "Files", to: `/repo/${id}/code`, icon: <Files size={15} /> },
            { label: "Pull Requests", to: `/repo/${id}/prs`, icon: <GitPullRequest size={15} /> },
            { label: "Reviews", to: `/repo/${id}/collaboration`, icon: <Eye size={15} /> },

          ],
        },
        {
          title: "Code",
          items: [
            { label: "Explorer", to: `/repo/${id}/code`, icon: <Code2 size={15} /> },
            { label: "Symbols", to: `/repo/${id}/symbols`, icon: <Sparkles size={15} /> },
            { label: "Semantic Search", to: `/repo/${id}/search`, icon: <Search size={15} /> },
          ],
        },
        {
          title: "Intelligence",
          items: [
            { label: "AI Assistant", to: `/repo/${id}/chat`, icon: <Bot size={15} /> },
            { label: "Ownership", to: `/repo/${id}/intelligence`, icon: <Users size={15} /> },
            { label: "Risk Analysis", to: `/repo/${id}/intelligence`, icon: <ShieldAlert size={15} /> },
            { label: "Security", to: `/repo/${id}/security`, icon: <Lock size={15} /> },
            { label: "Risk Prediction", to: `/repo/${id}/intelligence`, icon: <TrendingUp size={15} />, soon: true },
          ],
        },
      ]
    : [
        {
          title: "GitPulse",
          items: [
            { label: "Home", to: "/", icon: <LayoutDashboard size={15} /> },
          ],
        },
      ];

  return (
    <aside
      style={{
        width: collapsed ? 48 : 220,
        minWidth: collapsed ? 48 : 220,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Logo row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "14px 0" : "14px 16px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
          height: 48,
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontWeight: 700,
              fontSize: "15px",
              color: "var(--color-green)",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-display)",
            }}
          >
            GitPulse
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-muted)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
        }}
      >
        {groups.map((group) => (
          <div key={group.title} style={{ marginBottom: "4px" }}>
            {!collapsed && (
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-muted)",
                }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarNavItem({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  if (item.soon) {
    return (
      <div
        title={collapsed ? item.label : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: collapsed ? "8px 0" : "8px 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          opacity: 0.4,
          cursor: "default",
          fontSize: "13px",
          color: "var(--color-muted)",
          userSelect: "none",
        }}
      >
        <span style={{ flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
            <span
              style={{
                fontSize: "9px",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                padding: "1px 5px",
                flexShrink: 0,
              }}
            >
              Soon
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      end
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: collapsed ? "8px 0" : "8px 16px",
        justifyContent: collapsed ? "center" : "flex-start",
        fontSize: "13px",
        color: isActive ? "var(--color-text)" : "var(--color-muted)",
        background: isActive ? "rgba(239,35,60,0.12)" : "transparent",
        borderRight: isActive ? "2px solid var(--color-red)" : "2px solid transparent",
        textDecoration: "none",
        transition: "background 0.15s, color 0.15s",
        fontWeight: isActive ? 500 : 400,
      })}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        // Reset handled by NavLink style fn rerunning
        (e.currentTarget as HTMLElement).style.background = "";
      }}
    >
      <span style={{ flexShrink: 0 }}>{item.icon}</span>
      {!collapsed && (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.label}
        </span>
      )}
    </NavLink>
  );
}
