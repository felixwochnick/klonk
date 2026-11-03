-- Gruppen und Klonk Cloud. Hilfsfunktionen mit SECURITY DEFINER (lesen ohne RLS, vermeidet Rekursion in Policies).
CREATE OR REPLACE FUNCTION klonk.group_role(gid uuid) RETURNS group_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT role FROM group_members WHERE group_id = gid AND user_id = klonk.current_user_id() $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.group_org(gid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT organization_id FROM groups WHERE id = gid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.group_has_members(gid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = gid) $$;
--> statement-breakpoint
-- Lehrkraft oder Admin derselben Organisation
CREATE OR REPLACE FUNCTION klonk.is_org_staff(org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT org IS NOT NULL AND org = klonk.current_org_id() AND klonk.current_member_role() IN ('teacher', 'admin') $$;
--> statement-breakpoint
-- Gruppenleitung, Admin der Organisation oder Plattform-Admin
CREATE OR REPLACE FUNCTION klonk.can_manage_group(gid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.is_platform_admin()
    OR klonk.group_role(gid) = 'leader'
    OR (klonk.group_org(gid) = klonk.current_org_id() AND klonk.current_member_role() = 'admin') $$;
--> statement-breakpoint
-- Gruppenleitung oder Admin der Organisation (ohne Betreiber:innen) – sieht Abgaben
CREATE OR REPLACE FUNCTION klonk.leads_group(gid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.group_role(gid) = 'leader'
    OR (klonk.group_org(gid) = klonk.current_org_id() AND klonk.current_member_role() = 'admin') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.assignment_group(aid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT group_id FROM cloud_assignments WHERE id = aid $$;
--> statement-breakpoint
-- Lesen: eigenes Projekt, gemeinsamer Ordner der eigenen Gruppe, Abgaben für die Gruppenleitung.
-- Betreiber:innen lesen keine persönlichen Projekte und keine Abgaben.
CREATE OR REPLACE FUNCTION klonk.can_read_cloud_project(pid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM cloud_projects p WHERE p.id = pid AND (
    p.owner_id = klonk.current_user_id()
    OR (p.group_id IS NOT NULL AND (klonk.group_role(p.group_id) IS NOT NULL OR klonk.can_manage_group(p.group_id)))
    OR (p.assignment_id IS NOT NULL AND klonk.leads_group(klonk.assignment_group(p.assignment_id)))
  )) $$;
--> statement-breakpoint
-- Schreiben: eigenes Projekt; im gemeinsamen Ordner die Gruppenleitung, Mitglieder nur, wenn freigegeben
CREATE OR REPLACE FUNCTION klonk.can_write_cloud_project(pid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM cloud_projects p LEFT JOIN groups g ON g.id = p.group_id WHERE p.id = pid AND (
    p.owner_id = klonk.current_user_id()
    OR (p.group_id IS NOT NULL AND (klonk.can_manage_group(p.group_id) OR (klonk.group_role(p.group_id) = 'member' AND g.members_can_write)))
  )) $$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON groups, group_members, cloud_projects, cloud_files, cloud_assignments TO klonk_user;
--> statement-breakpoint
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cloud_projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cloud_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cloud_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Gruppen: Lehrkräfte/Admins sehen alle der Organisation, Mitglieder ihre eigenen; anlegen dürfen Lehrkräfte/Admins
CREATE POLICY groups_select ON groups FOR SELECT TO klonk_user
  USING (klonk.is_org_staff(organization_id) OR klonk.group_role(id) IS NOT NULL OR klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY groups_insert ON groups FOR INSERT TO klonk_user
  WITH CHECK (klonk.is_org_staff(organization_id) OR klonk.is_platform_admin());
--> statement-breakpoint
CREATE POLICY groups_update ON groups FOR UPDATE TO klonk_user
  USING (klonk.can_manage_group(id)) WITH CHECK (klonk.can_manage_group(id) AND organization_id = klonk.group_org(id));
--> statement-breakpoint
CREATE POLICY groups_delete ON groups FOR DELETE TO klonk_user
  USING (klonk.can_manage_group(id));
--> statement-breakpoint
-- Mitglieder: verwaltet die Gruppenleitung; nur Konten derselben Organisation.
-- Wer eine (noch leere) Gruppe anlegt, trägt sich selbst als Leitung ein.
CREATE POLICY group_members_select ON group_members FOR SELECT TO klonk_user
  USING (klonk.group_role(group_id) IS NOT NULL OR klonk.is_org_staff(klonk.group_org(group_id)) OR klonk.can_manage_group(group_id));
--> statement-breakpoint
CREATE POLICY group_members_insert ON group_members FOR INSERT TO klonk_user
  WITH CHECK (
    klonk.stored_org_id(user_id) = klonk.group_org(group_id)
    AND (klonk.can_manage_group(group_id)
      OR (user_id = klonk.current_user_id() AND role = 'leader' AND klonk.is_org_staff(klonk.group_org(group_id)) AND NOT klonk.group_has_members(group_id)))
  );
--> statement-breakpoint
CREATE POLICY group_members_update ON group_members FOR UPDATE TO klonk_user
  USING (klonk.can_manage_group(group_id)) WITH CHECK (klonk.can_manage_group(group_id));
--> statement-breakpoint
CREATE POLICY group_members_delete ON group_members FOR DELETE TO klonk_user
  USING (klonk.can_manage_group(group_id));
--> statement-breakpoint
-- Gleiche Bedingungen wie can_read_cloud_project(), aber auf der Zeile selbst (sonst scheitert INSERT … RETURNING)
CREATE POLICY cloud_projects_select ON cloud_projects FOR SELECT TO klonk_user
  USING (
    owner_id = klonk.current_user_id()
    OR (group_id IS NOT NULL AND (klonk.group_role(group_id) IS NOT NULL OR klonk.can_manage_group(group_id)))
    OR (assignment_id IS NOT NULL AND klonk.leads_group(klonk.assignment_group(assignment_id)))
  );
--> statement-breakpoint
-- Eigene Projekte (Abgaben nur zu Aufgaben der eigenen Gruppe); gemeinsame Ordner legt die Gruppenleitung an
CREATE POLICY cloud_projects_insert ON cloud_projects FOR INSERT TO klonk_user
  WITH CHECK (
    (owner_id = klonk.current_user_id() AND group_id IS NULL
      AND (assignment_id IS NULL OR klonk.group_role(klonk.assignment_group(assignment_id)) IS NOT NULL))
    OR (owner_id IS NULL AND group_id IS NOT NULL AND assignment_id IS NULL AND klonk.can_manage_group(group_id))
  );
--> statement-breakpoint
CREATE POLICY cloud_projects_update ON cloud_projects FOR UPDATE TO klonk_user
  USING (klonk.can_write_cloud_project(id))
  WITH CHECK (klonk.can_write_cloud_project(id));
--> statement-breakpoint
CREATE POLICY cloud_projects_delete ON cloud_projects FOR DELETE TO klonk_user
  USING (owner_id = klonk.current_user_id() OR (group_id IS NOT NULL AND klonk.can_manage_group(group_id)));
--> statement-breakpoint
CREATE POLICY cloud_files_select ON cloud_files FOR SELECT TO klonk_user
  USING (klonk.can_read_cloud_project(project_id));
--> statement-breakpoint
CREATE POLICY cloud_files_write ON cloud_files FOR ALL TO klonk_user
  USING (klonk.can_write_cloud_project(project_id))
  WITH CHECK (klonk.can_write_cloud_project(project_id));
--> statement-breakpoint
CREATE POLICY cloud_assignments_select ON cloud_assignments FOR SELECT TO klonk_user
  USING (klonk.group_role(group_id) IS NOT NULL OR klonk.can_manage_group(group_id));
--> statement-breakpoint
CREATE POLICY cloud_assignments_write ON cloud_assignments FOR ALL TO klonk_user
  USING (klonk.can_manage_group(group_id))
  WITH CHECK (klonk.can_manage_group(group_id));
