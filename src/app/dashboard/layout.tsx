"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    LayoutDashboard, Video, Plus, User,
    BrainCircuit, LogOut, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/dashboard/videos", label: "Video bài giảng", icon: Video },
    { href: "/dashboard/videos/new", label: "Tạo video mới", icon: Plus },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session } = useSession();

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push("/login");
    };

    const userName = session?.user?.name ?? "Giảng viên";
    const userEmail = session?.user?.email ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session?.user as any)?.role ?? "teacher";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgName = (session?.user as any)?.organizationName ?? "";

    return (
        <div className="flex flex-col min-h-screen bg-surface">
            {/* Top Navigation Bar */}
            <header className="flex-shrink-0 bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-6 px-6 h-14">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0 mr-4">
                        <div className="p-1.5 bg-gradient-brand rounded-xl transition-all group-hover:opacity-90">
                            <BrainCircuit className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <span className="font-bold text-slate-800 text-base leading-none tracking-tight">
                                Learnify
                            </span>
                            <p className="text-[10px] text-brand-500 leading-none mt-0.5 font-medium">
                                AI Video Studio
                            </p>
                        </div>
                    </Link>

                    <div className="h-5 w-px bg-slate-200 flex-shrink-0" />

                    {/* Nav */}
                    <nav className="flex items-center gap-1">
                        {navItems.map(({ href, label, icon: Icon }) => {
                            const active = pathname === href;
                            return (
                                <Link key={href} href={href}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                                        active
                                            ? "bg-brand-50 text-brand-600 border border-brand-200"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                    )}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    {label}
                                </Link>
                            );
                        })}


                        {/* Admin — chỉ hiện cho role admin */}
                        {userRole === "admin" && (
                            <Link href="/dashboard/admin"
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                                    pathname === "/dashboard/admin"
                                        ? "bg-purple-50 text-purple-600 border border-purple-200"
                                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                )}
                            >
                                <Building2 className="w-4 h-4 flex-shrink-0" />
                                Quản trị
                            </Link>
                        )}
                    </nav>

                    {/* User + Logout */}
                    <div className="ml-auto flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="text-xs font-medium text-slate-800 leading-none">{userName}</p>
                            <p className="text-[10px] text-slate-500 leading-none mt-0.5 truncate max-w-[140px]">
                                {orgName ? `${orgName} · ${userRole === 'admin' ? 'Admin' : 'GV'}` : userEmail}
                            </p>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-brand-500" />
                        </div>

                        {/* Logout button */}
                        <button
                            onClick={handleLogout}
                            title="Đăng xuất"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all duration-200"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden md:inline">Đăng xuất</span>
                        </button>
                    </div>
                </div>
            </header>


            <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
    );
}
