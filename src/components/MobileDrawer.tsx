"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardNav } from "@/components/DashboardNav";
import { SignOutButton } from "@/components/SignOutButton";

type MobileDrawerProps = {
  fullName: string;
  role: string;
};

export function MobileDrawer({ fullName, role }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <header className="mobile-header">
        <button
          className="drawer-toggle"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <div className="hamburger">
            <span />
            <span />
            <span />
          </div>
        </button>
        <div className="mobile-brand">Myst</div>
      </header>

      {/* Backdrop */}
      <div
        className={`drawer-backdrop${open ? " open" : ""}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside className={`drawer${open ? " open" : ""}`}>
        <div className="drawer-brand">
          <span className="drawer-eyebrow">Inventory Workspace</span>
          <strong>Myst</strong>
        </div>
        <div className="drawer-user">
          <div className="drawer-user-name">{fullName}</div>
          <span className="badge">{role}</span>
        </div>
        <DashboardNav variant="drawer" onNavigate={close} />
        <div className="drawer-footer">
          <SignOutButton className="full-width" />
        </div>
      </aside>
    </>
  );
}
