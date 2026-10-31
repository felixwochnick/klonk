-- Row Level Security
--
-- Die App verbindet sich mit dem Owner der Tabellen (umgeht RLS) und wechselt für alle
-- nutzerbezogenen Abfragen per `SET LOCAL ROLE klonk_user` in eine eingeschränkte Rolle.
-- Der angemeldete Nutzer wird per `set_config('klonk.user_id', …, true)` übergeben;
-- Organisation und Rollen werden daraus autoritativ aus der Tabelle `users` gelesen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klonk_user') THEN
    CREATE ROLE klonk_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- Der Verbindungsnutzer muss in die Rolle wechseln dürfen
DO $$
BEGIN
  EXECUTE format('GRANT klonk_user TO %I', current_user);
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS klonk;
--> statement-breakpoint
GRANT USAGE ON SCHEMA klonk TO klonk_user;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO klonk_user;
--> statement-breakpoint

-- Hilfsfunktionen (SECURITY DEFINER: lesen `users` ohne RLS, vermeidet Rekursion in Policies)
CREATE OR REPLACE FUNCTION klonk.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('klonk.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT organization_id FROM users WHERE id = klonk.current_user_id() AND NOT disabled $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.current_member_role() RETURNS member_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT role FROM users WHERE id = klonk.current_user_id() AND NOT disabled $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT coalesce((SELECT platform_role IN ('owner', 'developer') FROM users WHERE id = klonk.current_user_id() AND NOT disabled), false) $$;
--> statement-breakpoint
-- Gespeicherte (alte) Werte einer Zeile – für WITH CHECK gegen Rechteausweitung
CREATE OR REPLACE FUNCTION klonk.stored_member_role(uid uuid) RETURNS member_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT role FROM users WHERE id = uid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.stored_platform_role(uid uuid) RETURNS platform_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT platform_role FROM users WHERE id = uid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.stored_org_id(uid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT organization_id FROM users WHERE id = uid $$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint

-- Rechte der eingeschränkten Rolle (Sessions bleiben dem Server vorbehalten)
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, organization_auth_settings, accounts TO klonk_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON users TO klonk_user;
--> statement-breakpoint
GRANT UPDATE (username, email, display_name, role, platform_role, password_hash, must_change_password, disabled) ON users TO klonk_user;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_auth_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- organizations: Mitglieder sehen ihre Organisation, Admins bearbeiten sie
CREATE POLICY organizations_select ON organizations FOR SELECT TO klonk_user
  USING (id = klonk.current_org_id() OR klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO klonk_user
  USING ((id = klonk.current_org_id() AND klonk.current_member_role() = 'admin') OR klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY organizations_insert ON organizations FOR INSERT TO klonk_user
  WITH CHECK (klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY organizations_delete ON organizations FOR DELETE TO klonk_user
  USING (klonk.is_platform_admin());
--> statement-breakpoint

-- organization_auth_settings: nur Admins der Organisation (enthält Secrets)
CREATE POLICY organization_auth_settings_admin ON organization_auth_settings FOR ALL TO klonk_user
  USING ((organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin') OR klonk.is_platform_admin())
  WITH CHECK ((organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin') OR klonk.is_platform_admin());
--> statement-breakpoint

-- Hinweis: Bei mehreren permissiven Policies werden alle WITH-CHECK-Ausdrücke ODER-verknüpft –
-- jede Policy muss ihre Rollenbedingung daher auch im WITH CHECK wiederholen.

-- users: jeder sieht sich selbst; Lehrkräfte/Admins sehen ihre Organisation
CREATE POLICY users_select ON users FOR SELECT TO klonk_user
  USING (
    id = klonk.current_user_id()
    OR (organization_id = klonk.current_org_id() AND klonk.current_member_role() IN ('teacher', 'admin'))
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint
CREATE POLICY users_insert ON users FOR INSERT TO klonk_user
  WITH CHECK (
    (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin' AND platform_role = 'user')
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint
-- Eigenes Konto: Rolle, Plattformrolle und Organisation bleiben unverändert
CREATE POLICY users_update_self ON users FOR UPDATE TO klonk_user
  USING (id = klonk.current_user_id())
  WITH CHECK (
    id = klonk.current_user_id()
    AND role = klonk.stored_member_role(id)
    AND platform_role = klonk.stored_platform_role(id)
    AND organization_id IS NOT DISTINCT FROM klonk.stored_org_id(id)
  );
--> statement-breakpoint
-- Lehrkräfte: nur Lernende der eigenen Organisation (z. B. Passwort zurücksetzen)
CREATE POLICY users_update_teacher ON users FOR UPDATE TO klonk_user
  USING (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'teacher' AND role = 'member')
  WITH CHECK (
    organization_id = klonk.current_org_id()
    AND klonk.current_member_role() = 'teacher'
    AND id <> klonk.current_user_id()
    AND role = 'member'
    AND platform_role = klonk.stored_platform_role(id)
  );
--> statement-breakpoint
-- Admins: alle Konten der eigenen Organisation, ohne Plattformrollen zu vergeben
CREATE POLICY users_update_admin ON users FOR UPDATE TO klonk_user
  USING (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
  WITH CHECK (
    organization_id = klonk.current_org_id()
    AND klonk.current_member_role() = 'admin'
    AND platform_role = klonk.stored_platform_role(id)
  );
--> statement-breakpoint
CREATE POLICY users_update_platform ON users FOR UPDATE TO klonk_user
  USING (klonk.is_platform_admin())
  WITH CHECK (klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY users_delete ON users FOR DELETE TO klonk_user
  USING (
    (organization_id = klonk.current_org_id() AND klonk.current_member_role() = 'admin' AND id <> klonk.current_user_id())
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint

-- accounts: eigene Verknüpfungen; Admins sehen/lösen Verknüpfungen ihrer Organisation
CREATE POLICY accounts_select ON accounts FOR SELECT TO klonk_user
  USING (
    user_id = klonk.current_user_id()
    OR (klonk.stored_org_id(user_id) = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint
CREATE POLICY accounts_delete ON accounts FOR DELETE TO klonk_user
  USING (
    user_id = klonk.current_user_id()
    OR (klonk.stored_org_id(user_id) = klonk.current_org_id() AND klonk.current_member_role() = 'admin')
    OR klonk.is_platform_admin()
  );
--> statement-breakpoint
CREATE POLICY accounts_insert ON accounts FOR INSERT TO klonk_user
  WITH CHECK (klonk.is_platform_admin());
--> statement-breakpoint

-- Künftige Tabellen: Rechte für klonk_user explizit vergeben, RLS aktivieren und Policies anlegen
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM klonk_user;
