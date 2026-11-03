"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, ArrowRight, Check, CheckCheck, CircleAlert, Clock3, Inbox, LayoutGrid, ListFilter, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { Brand, CATEGORIES, CONDITIONS, CategoryIcon, Trusted, formatStatus } from "@/components/shared";

type Tab = "Explore" | "My listings" | "My requests" | "Incoming requests" | "Admin";
type ListingDraft = { name: string; category: string; condition: string; description: string };
const blank: ListingDraft = { name: "", category: "Power tools", condition: "Good", description: "" };
type Tool = ListingDraft & { _id: string; ownerId: string; archived?: boolean; availability?: string; ownerName?: string; trustedLender?: boolean };
type Loan = { _id: string; toolName: string; ownerName: string; borrowerName: string; startDate: string; endDate: string; status: string; automation: {eventType:string;status:string;sentAt?:number;createdAt:number}[] };

export default function DashboardPage() {
  return <><AuthLoading><div className="full-loader">Connecting to your neighborhood…</div></AuthLoading><Authenticated><DashboardInitializer/></Authenticated></>;
}
function DashboardInitializer() {
  const profile = useQuery(api.identity.me);
  const ensure = useMutation(api.identity.ensureProfile);
  const [error, setError] = useState("");
  useEffect(() => { if (profile === null) ensure({}).catch((e: Error) => setError(e.message)); }, [profile, ensure]);
  if (error) return <div className="full-loader">Profile error: {error}</div>;
  if (!profile) return <div className="full-loader">Setting up your neighborhood profile…</div>;
  return <Dashboard profile={profile}/>;
}

function Dashboard({ profile }: {profile: { _id: string; displayName: string; role: string; trustedLender: boolean }}) {
  const [tab, setTab] = useState<Tab>("Explore");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [listing, setListing] = useState<Tool | "new" | null>(null);
  const [borrow, setBorrow] = useState<Tool | null>(null);
  const catalog = useQuery(api.listings.catalog, category === "All" ? {} : {category});
  const mine = useQuery(api.listings.myListings);
  const outgoing = useQuery(api.loans.myRequests);
  const incoming = useQuery(api.loans.incomingRequests);
  const adminLoans = useQuery(api.loans.allLoans, profile.role === "admin" ? {} : "skip");
  const users = useQuery(api.identity.adminUsers, profile.role === "admin" ? {} : "skip");
  const remove = useMutation(api.listings.remove);
  const changeStatus = useMutation(api.loans.changeStatus);
  const setTrusted = useMutation(api.identity.setTrusted);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const tabs: {name:Tab;icon:typeof LayoutGrid;count?:number}[] = [
    {name:"Explore",icon:LayoutGrid}, {name:"My listings",icon:ListFilter,count:mine?.filter((x:any)=>!x.archived).length},
    {name:"My requests",icon:Clock3,count:outgoing?.length},
    {name:"Incoming requests",icon:Inbox,count:incoming?.filter((x:Loan)=>x.status === "pending").length},
    ...(profile.role === "admin" ? [{name:"Admin" as Tab,icon:ShieldCheck}] : []),
  ];
  async function perform(key: string, action: () => Promise<unknown>) {
    setBusy(key); setError("");
    try { await action(); } catch(e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }
  async function archive(tool: Tool) {
    if (!window.confirm(`Remove “${tool.name}”? Existing loan history will be preserved.`)) return;
    await perform(`del-${tool._id}`, () => remove({toolId:tool._id as any}));
  }
  return <div className="dashboard"><aside className="sidebar"><div className="sidebar-brand"><Brand/></div><div className="sidebar-label">YOUR SPACE</div><nav className="sidebar-nav">{tabs.map(({name,icon:Icon,count}) => <button key={name} className={`sidebar-item ${tab === name ? "selected" : ""}`} onClick={() => {setTab(name);setError("");}}><Icon size={18}/>{name}{count !== undefined && count > 0 && <span className="nav-count">{count}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-symbol">✳</span><strong>Sharing is caring.</strong><p>The best tool library is the one we build together.</p></div><Link href="/" className="back-site"><ArrowLeft size={16}/> Back to the site</Link></div></aside>
    <div className="dash-main"><header className="dash-header"><div className="breadcrumb">Community <span>/</span> <strong>{tab}</strong></div><div className="dash-user"><span className="user-greeting">Hey, {profile.displayName.split(" ")[0]}</span>{profile.trustedLender && <Trusted compact/>}<UserButton afterSignOutUrl="/"/></div></header><main className="dash-content"><div className="dash-heading"><div><span className="section-kicker">YOUR NEIGHBORHOOD, YOUR WAY</span><h1>{tab === "Explore" ? "Find your next handy thing." : tab === "My listings" ? "Tools you're sharing." : tab === "My requests" ? "Your borrowing history." : tab === "Incoming requests" ? "Neighbors knocking." : "Community overview."}</h1><p>{tab === "Explore" ? "A little sharing goes a long way. See what’s available to borrow." : tab === "My listings" ? "Keep track of what you've offered to the community." : tab === "My requests" ? "Every request, pickup and return in one place." : tab === "Incoming requests" ? "Approve requests and manage your active loans." : "Moderation and trusted lender controls."}</p></div>{["Explore","My listings"].includes(tab) && <button className="button button-dark" onClick={() => setListing("new")}><Plus size={17}/> List a tool</button>}</div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={17}/>{error}<button onClick={()=>setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}
    {tab === "Explore" && <><div className="filters"><div className="search-field"><Search size={18}/><input aria-label="Search tools" placeholder="Search for a tool..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="category-filters" aria-label="Filter by category">{CATEGORIES.map(c=><button key={c} className={`chip ${category===c?"active":""}`} onClick={()=>setCategory(c)}>{c}</button>)}</div></div><div className="dash-tool-grid">{catalog === undefined ? <Empty title="Loading tools…"/> : catalog.filter((t:Tool)=>t.name.toLowerCase().includes(search.toLowerCase())).length === 0 ? <Empty title="No tools found" detail="Try another category or be the first to list one."/> : catalog.filter((t:Tool)=>t.name.toLowerCase().includes(search.toLowerCase())).map((t:Tool)=><article className="dash-tool-card" key={t._id}><div className="dash-tool-art"><CategoryIcon category={t.category} size={34}/><span className={`availability ${t.availability === "Available"?"available":"reserved"}`}>{t.availability}</span></div><div className="dash-tool-body"><span className="tool-category">{t.category} · {t.condition}</span><h3>{t.name}</h3><p>{t.description}</p><div className="tool-owner">Shared by {t.ownerName} {t.trustedLender && <Trusted compact/>}</div><button className="button button-outline button-full" disabled={t.ownerId === profile._id || t.availability !== "Available"} onClick={()=>setBorrow(t)}>{t.ownerId === profile._id ? "Your listing" : "Request to borrow"} <ArrowRight size={16}/></button></div></article>)}</div></>}
    {tab === "My listings" && <div className="panel"><div className="panel-header"><h2>My listings <span>{mine?.filter((t:Tool)=>!t.archived).length ?? 0}</span></h2></div>{mine === undefined ? <Empty title="Loading listings…"/> : mine.filter((t:Tool)=>!t.archived).length===0 ? <Empty title="Nothing shared yet" detail="Make someone's day by listing your first tool."/> : mine.filter((t:Tool)=>!t.archived).map((t:Tool)=><div className="listing-row" key={t._id}><div className="row-icon"><CategoryIcon category={t.category}/></div><div className="row-info"><strong>{t.name}</strong><span>{t.category} · {t.condition}</span></div><button className="text-button" onClick={()=>setListing(t)}>Edit</button><button className="danger-icon" disabled={busy===`del-${t._id}`} aria-label={`Remove ${t.name}`} onClick={()=>archive(t)}><Trash2 size={17}/></button></div>)}</div>}
    {tab === "My requests" && <LoanPanel loans={outgoing} side="borrower" busy={busy} action={(id,next)=>perform(`${id}-${next}`,()=>changeStatus({requestId:id as any,nextStatus:next as any}))}/>}
    {tab === "Incoming requests" && <LoanPanel loans={incoming} side="lender" busy={busy} action={(id,next)=>perform(`${id}-${next}`,()=>changeStatus({requestId:id as any,nextStatus:next as any}))}/>}
    {tab === "Admin" && profile.role === "admin" && <div className="admin-layout"><div className="panel"><div className="panel-header"><h2>All loans <span>{adminLoans?.length ?? 0}</span></h2></div><LoanPanel loans={adminLoans} side="admin" busy={busy} action={()=>Promise.resolve()}/></div><div className="panel"><div className="panel-header"><h2>Lenders <span>{users?.length ?? 0}</span></h2></div>{users?.map((u:any)=><div className="listing-row" key={u._id}><div className="avatar-letter">{u.displayName[0]}</div><div className="row-info"><strong>{u.displayName}</strong><span>{u.role}</span></div><button className={`chip ${u.trustedLender ? "active" : ""}`} onClick={()=>perform(`trust-${u._id}`,()=>setTrusted({userId:u._id,trusted:!u.trustedLender}))}>{u.trustedLender ? "Trusted ✓" : "Mark trusted"}</button></div>)}</div><div className="panel"><div className="panel-header"><h2>All listings</h2></div>{catalog?.map((t:Tool)=><div className="listing-row" key={t._id}><div className="row-icon"><CategoryIcon category={t.category}/></div><div className="row-info"><strong>{t.name}</strong><span>{t.ownerName}</span></div><button className="danger-icon" aria-label={`Remove ${t.name}`} onClick={()=>archive(t)}><Trash2 size={17}/></button></div>)}</div></div>}
    </main></div>
    {listing && <ListingDialog tool={listing} onClose={()=>setListing(null)} onError={setError}/>} {borrow && <BorrowDialog tool={borrow} onClose={()=>setBorrow(null)} onError={setError}/>}</div>;
}
function Empty({title,detail}: {title:string;detail?:string}) {return <div className="empty-panel"><div className="empty-icon"><Inbox size={24}/></div><h3>{title}</h3>{detail && <p>{detail}</p>}</div>;}
function LoanPanel({loans,side,busy,action}: {loans:Loan[]|undefined;side:"lender"|"borrower"|"admin";busy:string|null;action:(id:string,next:string)=>Promise<unknown>}) {
  return <div className={side==="admin"?"":"panel"}>{side!=="admin" && <div className="panel-header"><h2>{side === "lender"?"Requests for your tools":"Your requests"} <span>{loans?.length??0}</span></h2></div>}{loans===undefined ? <Empty title="Loading requests…"/> : loans.length===0 ? <Empty title="All quiet here" detail="Requests will appear as soon as the neighborhood starts sharing."/> : [...loans].reverse().map(loan=><div className="loan-row" key={loan._id}><div className="loan-detail"><div className="loan-top"><strong>{loan.toolName}</strong><span className={`status status-${loan.status}`}>{formatStatus(loan.status)}</span></div><span className="loan-dates"><Clock3 size={14}/> {loan.startDate} → {loan.endDate}</span><p>{side === "borrower" ? `Lender: ${loan.ownerName}` : `Borrower: ${loan.borrowerName}`}</p>{loan.automation?.length > 0 && <span className="automation-info"><CheckCheck size={13}/>{loan.automation[0].eventType.replaceAll("_"," ")} · {loan.automation[0].status}{loan.automation[0].sentAt ? ` · ${new Date(loan.automation[0].sentAt).toLocaleDateString()}` : ""}</span>}</div><div className="loan-actions">{side==="lender" && loan.status === "pending" && <><button disabled={busy!==null} className="button button-dark button-small" onClick={()=>action(loan._id,"approved")}>Approve <Check size={14}/></button><button disabled={busy!==null} className="button button-outline button-small" onClick={()=>action(loan._id,"declined")}>Decline</button></>}{side==="lender" && loan.status === "approved" && <button disabled={busy!==null} className="button button-outline button-small" onClick={()=>action(loan._id,"returned")}>Mark returned <CheckCheck size={15}/></button>}{side==="borrower" && loan.status === "pending" && <button disabled={busy!==null} className="text-button" onClick={()=>action(loan._id,"cancelled")}>Cancel request</button>}</div></div>)}</div>;
}
function Dialog({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className="dialog"><header className="dialog-head"><div><span className="section-kicker">LENDLOOP COMMUNITY</span><h2>{title}</h2><p>{subtitle}</p></div><button className="close-button" aria-label="Close" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
function ListingDialog({tool,onClose,onError}:{tool:Tool|"new";onClose:()=>void;onError:(message:string)=>void}) {
  const [draft,setDraft] = useState<ListingDraft>(tool==="new"?blank:{name:tool.name,category:tool.category,condition:tool.condition,description:tool.description});
  const [error,setError] = useState("");const [saving,setSaving] = useState(false);
  const create = useMutation(api.listings.create); const update = useMutation(api.listings.update);
  async function submit(e:FormEvent) { e.preventDefault();setSaving(true);setError("");try {if(tool==="new") await create(draft);else await update({...draft,toolId:tool._id as any});onClose();} catch(e) {const message=e instanceof Error?e.message:"Unable to save.";setError(message);onError(message);} finally {setSaving(false);} }
  return <Dialog title={tool==="new"?"Share a tool":"Edit your listing"} subtitle="Tell neighbors what you're sharing." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Tool name<input required minLength={3} maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Cordless drill"/></label><div className="form-split"><label>Category<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{CATEGORIES.slice(1).map(c=><option key={c}>{c}</option>)}</select></label><label>Condition<select value={draft.condition} onChange={e=>setDraft({...draft,condition:e.target.value})}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Short description<textarea required minLength={10} maxLength={600} rows={4} placeholder="What should someone know before borrowing it?" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>{error && <p className="form-error">{error}</p>}<div className="dialog-foot"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button disabled={saving} className="button button-dark" type="submit">{saving?"Saving…":tool==="new"?"List my tool":"Save changes"}<ArrowRight size={16}/></button></div></form></Dialog>;
}
function BorrowDialog({tool,onClose,onError}:{tool:Tool;onClose:()=>void;onError:(message:string)=>void}) {
  const [startDate,setStartDate] = useState("");const [endDate,setEndDate] = useState("");const [saving,setSaving] = useState(false);const [error,setError] = useState("");
  const create = useMutation(api.loans.createRequest);
  const today = new Date().toISOString().slice(0,10);
  async function submit(e:FormEvent) { e.preventDefault();setSaving(true);setError("");try {await create({toolId:tool._id as any,startDate,endDate});onClose();}catch(e){const message=e instanceof Error?e.message:"Unable to request.";setError(message);onError(message);}finally{setSaving(false);} }
  return <Dialog title={`Borrow ${tool.name}`} subtitle="Pick the days you'd like to use it. The owner will review your request." onClose={onClose}><form className="dialog-form" onSubmit={submit}><div className="selected-tool"><span className="row-icon"><CategoryIcon category={tool.category}/></span><div><strong>{tool.name}</strong><span>Shared by {tool.ownerName}</span></div></div><div className="form-split"><label>From<input required type="date" min={today} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>To<input required type="date" min={startDate||today} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div><p className="form-note">Requests are for a maximum of 31 calendar days. Only the lender can confirm a return.</p>{error && <p className="form-error">{error}</p>}<div className="dialog-foot"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button disabled={saving} className="button button-dark" type="submit">{saving?"Sending…":"Send request"}<ArrowRight size={16}/></button></div></form></Dialog>;
}
