import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Code2, GitBranch, Layers3, Search, Sparkles, Zap } from "lucide-react";
import { createRepository } from "../api/client";

const GITHUB_RE = /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i;
const FEATURES = [
  { icon: Bot, title: "Repository Intelligence", text: "Turn any public repository into a living map of its commits, contributors, branches, and ownership patterns.", className: "home-feature--wide" },
  { icon: Code2, title: "Code Context", text: "Explore source, symbols, imports, and relationships without losing your place.", className: "home-feature--code" },
  { icon: Zap, title: "Semantic Search", text: "Ask questions of your codebase in plain language.", className: "" },
  { icon: Layers3, title: "Collaboration Map", text: "See review bottlenecks and team knowledge at a glance.", className: "" },
];

export function Home() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("https://github.com/pallets/click");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!GITHUB_RE.test(trimmed.replace(/\.git$/, ""))) { setError("Enter a valid public GitHub URL (github.com/owner/repo)."); return; }
    setError(null); setLoading(true);
    try { const repo = await createRepository(trimmed); navigate(`/repo/${repo.id}`); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Failed to start ingestion."); }
    finally { setLoading(false); }
  };

  return <div className="home-noir">
    <div className="home-noir__backdrop" aria-hidden="true"><i /><i /><i /></div>
    <header className="home-nav-wrap"><nav className="home-nav" aria-label="Main navigation">
      <a className="home-brand" href="#top"><span /><strong>GitPulse</strong></a>
      <div className="home-nav__links"><button onClick={() => scrollTo("product")}>Product</button><button onClick={() => scrollTo("features")}>Solutions</button><button onClick={() => scrollTo("workflow")}>Resources</button></div>
      <button className="home-nav__cta" onClick={() => scrollTo("analyze")}>Get Access <ArrowRight size={14} /></button>
    </nav></header>
    <main id="top">
      <section className="home-hero" id="product">
        <div className="home-live"><b /> GitPulse Intelligence is now live <ArrowRight size={13} /></div>
        <h1>Repository Intelligence<br />for the <em>Future</em></h1>
        <p>Understand the code and collaboration behind every commit. GitPulse blends graph analysis with AI to make software teams faster and more resilient.</p>
        <div className="home-hero__actions"><button className="home-button home-button--shiny" onClick={() => scrollTo("analyze")}>Analyze a Repository <ArrowRight size={18} /></button><a className="home-button home-button--ghost" href="https://github.com" target="_blank" rel="noreferrer"><GitBranch size={19} /> View on GitHub</a></div>
        <div className="home-integrations"><span>BUILT FOR</span><b><GitBranch size={19} /> Git workflows</b><b><Code2 size={19} /> Code analysis</b><b><Sparkles size={19} /> AI discovery</b><b><Layers3 size={19} /> Team insight</b></div>
      </section>
      <section className="home-section" id="features"><div className="home-section__heading"><p className="home-eyebrow">ONE COHESIVE PLATFORM</p><h2>The operating system for<br /><span>modern engineering teams.</span></h2><p>Replace fragmented repository tools with one clear, connected view of how your software gets built.</p></div>
        <div className="home-feature-grid">{FEATURES.map(({ icon: Icon, title, text, className }) => <article className={`home-feature ${className}`} key={title}><div className="home-feature__icon"><Icon size={24} /></div><h3>{title}</h3><p>{text}</p>{className === "home-feature--wide" && <span className="home-feature__explore">EXPLORE FEATURE <ArrowRight size={15} /></span>}</article>)}</div>
      </section>
      <section className="home-proof" id="workflow"><p className="home-eyebrow">REPOSITORY WORKFLOW</p><blockquote>Analyze commit history, contributor ownership, review relationships, source structure, and semantic code context in one workspace.</blockquote><div className="home-proof__person"><span>GP</span><p><b>GitPulse repository intelligence</b><small>Built from your repository data</small></p></div></section>
      <section className="home-section home-analyze" id="analyze"><div className="home-section__heading"><p className="home-eyebrow">START EXPLORING</p><h2>Bring your repository<br /><span>into focus.</span></h2><p>Enter a public GitHub repository to build its intelligence map.</p></div>
        <form className="home-analyze__form" onSubmit={handleSubmit}><label htmlFor="repository-url">Public GitHub repository URL</label><div><Search size={18} /><input id="repository-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={loading} placeholder="https://github.com/owner/repo" /><button className="home-button home-button--red" type="submit" disabled={loading}>{loading ? "Analyzing…" : "Analyze"} <ArrowRight size={17} /></button></div>{error && <p className="home-analyze__error">{error}</p>}</form>
      </section>
    </main>
    <footer className="home-footer"><div className="home-footer__main"><a className="home-brand" href="#top"><span /><strong>GitPulse</strong></a><p>AI-powered repository intelligence for teams who build what matters.</p><div><a href="#features">Features</a><a href="#analyze">Analyze</a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a></div></div><div className="home-footer__word">GITPULSE</div><small>© 2026 GitPulse. Built for better software decisions.</small></footer>
  </div>;
}

