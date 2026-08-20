// Minimal hand-typed DB types. Supabase CLI can regenerate this from the
// running project (`supabase gen types typescript`); the hand version is
// enough for build-time type-checking across the app.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "rider" | "admin" | "authority";
export type IncidentStatus = "received" | "reported" | "canceled";
export type IncidentType = "SOS Button" | "SOS Volume keys" | "SOS USB" | "SOS Fall Detected";
export type PingStatus = "sent" | "received";
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";
export type ProfileStatus = "Active" | "Inactive" | "Deleted";

export type Profile = {
  id: string;
  fullname: string;
  phone: string | null;
  role: UserRole;
  status: ProfileStatus;
  profile_img: string | null;
  created_at: string;
};

export type EmergencyContact = {
  id: string;
  user_id: string;
  fullname: string;
  phone: string;
  created_at: string;
};

export type Device = {
  id: string;
  device_uuid: string;
  user_id: string | null;
  ip: string | null;
  last_seen: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  device_id: string;
  device_firebase_id: string;
  created_at: string;
};

export type Incident = {
  id: string;
  lat: number | null;
  lng: number | null;
  location: unknown; // geography(Point, 4326) — read as unknown
  user_id: string | null;
  device_id: string | null;
  status: IncidentStatus;
  incident_type: IncidentType | null;
  read: boolean;
  occurred_at: string;
  created_at: string;
};

export type Ping = {
  id: string;
  device_id: string;
  ping_date: string;
  status: PingStatus;
};

export type ContactSubmission = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  subscription_id: string;
  status: SubscriptionStatus;
  start: string;
  end: string | null;
  created_at: string;
};

export type IncidentLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  device_id: string | null;
  lat: number | null;
  lng: number | null;
  incident_id: string;
};

export type Log = {
  id: number;
  actor: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Json | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; fullname: string }; Update: Partial<Profile> };
      emergency_contacts: { Row: EmergencyContact; Insert: Omit<EmergencyContact, "id" | "created_at">; Update: Partial<EmergencyContact> };
      devices: { Row: Device; Insert: Omit<Device, "id" | "created_at">; Update: Partial<Device> };
      notifications: { Row: Notification; Insert: Omit<Notification, "id" | "created_at">; Update: Partial<Notification> };
      incidents: { Row: Incident; Insert: Omit<Incident, "id" | "occurred_at" | "created_at">; Update: Partial<Incident> };
      incident_logs: { Row: IncidentLog; Insert: Omit<IncidentLog, "id" | "created_at">; Update: Partial<IncidentLog> };
      pings: { Row: Ping; Insert: Omit<Ping, "id" | "ping_date">; Update: Partial<Ping> };
      contacts: { Row: ContactSubmission; Insert: Omit<ContactSubmission, "id" | "created_at">; Update: Partial<ContactSubmission> };
      subscriptions: { Row: Subscription; Insert: Omit<Subscription, "id" | "created_at">; Update: Partial<Subscription> };
      logs: { Row: Log; Insert: Omit<Log, "id" | "created_at">; Update: Partial<Log> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      incident_status: IncidentStatus;
      incident_type: IncidentType;
      ping_status: PingStatus;
      subscription_status: SubscriptionStatus;
      profile_status: ProfileStatus;
    };
  };
};
