"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Power,
  PowerOff,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, formatDate } from "@/lib/utils";

export type ProfileStatus = "Active" | "Inactive" | "Deleted";
export type UserRole = "rider" | "admin" | "authority" | "seller";

export type AdminUserRow = {
  id: string;
  fullname: string;
  phone: string | null;
  role: UserRole;
  status: ProfileStatus;
  created_at: string;
};

const PAGE_SIZE = 25;

type Action =
  | { kind: "delete"; user: AdminUserRow }
  | { kind: "reset"; user: AdminUserRow }
  | { kind: "toggle"; user: AdminUserRow }
  | { kind: "role"; user: AdminUserRow; nextRole: UserRole };

export function UsersView({
  initialUsers,
  total,
  currentUserId,
}: {
  initialUsers: AdminUserRow[];
  total: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = React.useState<AdminUserRow[]>(initialUsers);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<Action | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [roleChangingId, setRoleChangingId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<
    null | { kind: "ok" | "err"; message: string }
  >(null);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      [u.fullname, u.phone ?? "", u.id, u.role, u.status]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [users, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageUsers = React.useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  React.useEffect(() => {
    // Snap back to page 1 if filter shrinks below current page.
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  function pushFeedback(kind: "ok" | "err", message: string) {
    setFeedback({ kind, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  async function runStatusChange(user: AdminUserRow, status: ProfileStatus) {
    const res = await fetch(`/api/admin/users/${user.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      profile?: { id: string; status: ProfileStatus };
    };
    if (!res.ok || !json.ok) {
      pushFeedback("err", json.error ?? "Status change failed");
      return false;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, status: json.profile?.status ?? status }
          : u,
      ),
    );
    pushFeedback("ok", `${user.fullname} → ${status}`);
    router.refresh();
    return true;
  }

  async function runRoleChange(user: AdminUserRow, role: UserRole) {
    const res = await fetch(`/api/admin/users/${user.id}/role`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      profile?: { id: string; role: UserRole };
    };
    if (!res.ok || !json.ok) {
      pushFeedback("err", json.error ?? "Role change failed");
      return false;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: json.profile?.role ?? role } : u)),
    );
    pushFeedback("ok", `${user.fullname} → ${role}`);
    router.refresh();
    return true;
  }

  async function runResetPassword(user: AdminUserRow) {
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      pushFeedback("err", json.error ?? "Reset failed");
      return false;
    }
    pushFeedback("ok", `Reset email sent to ${user.fullname}`);
    return true;
  }

  const busy = action !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, role…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">
            {filtered.length} of {total} users
          </p>
          <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden /> Invite user
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-md border px-4 py-2 text-sm",
            feedback.kind === "ok"
              ? "border-status-success/30 bg-status-success/10 text-status-success"
              : "border-status-critical/30 bg-status-critical/10 text-status-critical",
          )}
        >
          {feedback.message}
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                  No users match your search.
                </TableCell>
              </TableRow>
            )}
            {pageUsers.map((u) => {
              const isSelf = u.id === currentUserId;
              const canDelete = !isSelf && u.status !== "Deleted";
              const canToggle = !isSelf;
              return (
                <TableRow key={u.id} className={u.status === "Deleted" ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">{u.fullname}</TableCell>
                  <TableCell>{u.phone ?? "—"}</TableCell>
                  <TableCell>
                    <select
                      value={u.role}
                      disabled={isSelf || roleChangingId === u.id}
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole;
                        if (nextRole === u.role) return;
                        setAction({ kind: "role", user: u, nextRole });
                      }}
                      title={isSelf ? "You can't change your own role" : undefined}
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="rider">rider</option>
                      <option value="seller">seller</option>
                      <option value="authority">authority</option>
                      <option value="admin">admin</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <TableCell>{formatDate(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu
                      trigger={({ open, toggle, triggerRef }) => (
                        <button
                          type="button"
                          ref={triggerRef}
                          aria-haspopup="menu"
                          aria-expanded={open}
                          onClick={toggle}
                          disabled={busy}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {action && action.user.id === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                          <span className="sr-only">Open user actions</span>
                        </button>
                      )}
                    >
                      <DropdownMenuItem
                        onSelect={() => router.push(`/admin/users/${u.id}`)}
                      >
                        <Eye className="h-4 w-4" /> View profile
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setAction({ kind: "reset", user: u })}
                        disabled={isSelf}
                      >
                        <KeyRound className="h-4 w-4" /> Send reset password
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setAction({ kind: "toggle", user: u })}
                        disabled={!canToggle}
                      >
                        {u.status === "Inactive" || u.status === "Deleted" ? (
                          <>
                            <Power className="h-4 w-4" /> Set Active
                          </>
                        ) : (
                          <>
                            <PowerOff className="h-4 w-4" /> Set Inactive
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setAction({ kind: "delete", user: u })}
                        disabled={!canDelete}
                        destructive
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
      />

      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(message) => {
          pushFeedback("ok", message);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={action?.kind === "delete" && !!action.user}
        title={`Delete ${action?.user.fullname ?? "user"}?`}
        description={
          <>
            This will set the profile status to <strong>Deleted</strong>. They
            will no longer be able to sign in. You can reverse this by setting
            their status back to Active.
          </>
        }
        confirmLabel="Delete user"
        destructive
        onCancel={() => setAction(null)}
        onConfirm={async () => {
          if (!action || action.kind !== "delete") return;
          const ok = await runStatusChange(action.user, "Deleted");
          if (ok) setAction(null);
        }}
      />

      <ConfirmDialog
        open={action?.kind === "reset" && !!action.user}
        title={`Send password reset to ${action?.user.fullname ?? "user"}?`}
        description={
          <>They&apos;ll receive an email with a link to choose a new password.</>
        }
        confirmLabel="Send reset email"
        onCancel={() => setAction(null)}
        onConfirm={async () => {
          if (!action || action.kind !== "reset") return;
          const ok = await runResetPassword(action.user);
          if (ok) setAction(null);
        }}
      />

      <ConfirmDialog
        open={action?.kind === "toggle" && !!action.user}
        title={
          action?.user.status === "Active"
            ? `Set ${action?.user.fullname ?? "user"} to Inactive?`
            : `Reactivate ${action?.user.fullname ?? "user"}?`
        }
        description={
          action?.user.status === "Active"
            ? "They will be unable to sign in until reactivated."
            : "They will be able to sign in again."
        }
        confirmLabel={
          action?.user.status === "Active" ? "Set Inactive" : "Set Active"
        }
        onCancel={() => setAction(null)}
        onConfirm={async () => {
          if (!action || action.kind !== "toggle") return;
          const next: ProfileStatus =
            action.user.status === "Active" ? "Inactive" : "Active";
          const ok = await runStatusChange(action.user, next);
          if (ok) setAction(null);
        }}
      />

      <ConfirmDialog
        open={action?.kind === "role" && !!action.user}
        title={
          action?.kind === "role"
            ? `Change ${action.user.fullname}'s role to ${action.nextRole}?`
            : ""
        }
        description={
          action?.kind === "role" ? (
            <>
              This changes what {action.user.fullname} can see and do across
              the whole dashboard, effective immediately.
            </>
          ) : null
        }
        confirmLabel="Change role"
        onCancel={() => setAction(null)}
        onConfirm={async () => {
          if (!action || action.kind !== "role") return;
          setRoleChangingId(action.user.id);
          const ok = await runRoleChange(action.user, action.nextRole);
          setRoleChangingId(null);
          if (ok) setAction(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ProfileStatus }) {
  if (status === "Active") {
    return <Badge variant="success">Active</Badge>;
  }
  if (status === "Inactive") {
    return <Badge variant="warning">Inactive</Badge>;
  }
  return <Badge variant="destructive">Deleted</Badge>;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
