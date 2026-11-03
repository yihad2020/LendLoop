"use client";
import { Drill, Sprout, CookingPot, Tent, House, Package, Hammer, ShieldCheck, type LucideIcon } from "lucide-react";
export const CATEGORIES = ["All", "Power tools", "Garden", "Kitchen", "Camping", "Home", "Other"];
export const CONDITIONS = ["Like new", "Good", "Fair"];
const iconMap: Record<string, LucideIcon> = {
  "Power tools": Drill, "Garden": Sprout, "Kitchen": CookingPot, "Camping": Tent, "Home": House, "Other": Package,
};
export function CategoryIcon({category, size=23}: {category:string;size?:number}) {
  const Icon = iconMap[category] || Hammer;
  return <Icon size={size} strokeWidth={1.65} aria-hidden="true" />;
}
export function Brand() {
  return <a className="brand" href="/" aria-label="LendLoop home"><span className="brand-mark"><Hammer size={22} strokeWidth={2.2}/></span><span>Lend<span className="brand-accent">Loop</span></span></a>;
}
export function Trusted({compact=false}: {compact?:boolean}) {
  return <span className="trusted"><ShieldCheck size={13}/>{compact ? "Trusted" : "Trusted lender"}</span>;
}
export function formatStatus(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
