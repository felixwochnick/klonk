-- Lernmodule in der Klonk Cloud: Freigabe je Gruppe, Projekte je Modul, Lesezugriff der Gruppenleitung
-- Darf das aktuelle Konto ein Modul starten? Privatkonten und Lehrkräfte/Admins immer, Lernende nur bei Freigabe in einer ihrer Gruppen
CREATE OR REPLACE FUNCTION klonk.can_start_learn_module(module text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT klonk.current_org_id() IS NULL
    OR klonk.current_member_role() IN ('teacher', 'admin')
    OR EXISTS (SELECT 1 FROM group_members gm JOIN group_learn_modules glm ON glm.group_id = gm.group_id
      WHERE gm.user_id = klonk.current_user_id() AND glm.module_id = module) $$;
--> statement-breakpoint
-- Leitet das aktuelle Konto eine Gruppe, in der `learner` Mitglied und das Modul freigegeben ist?
CREATE OR REPLACE FUNCTION klonk.leads_learner(learner uuid, module text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM group_members gm JOIN group_learn_modules glm ON glm.group_id = gm.group_id
      WHERE gm.user_id = learner AND gm.role = 'member' AND glm.module_id = module AND klonk.leads_group(gm.group_id)) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klonk.can_read_cloud_project(pid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM cloud_projects p WHERE p.id = pid AND (
    p.owner_id = klonk.current_user_id()
    OR (p.group_id IS NOT NULL AND (klonk.group_role(p.group_id) IS NOT NULL OR klonk.can_manage_group(p.group_id)))
    OR (p.assignment_id IS NOT NULL AND klonk.leads_group(klonk.assignment_group(p.assignment_id)))
    OR (p.learn_module IS NOT NULL AND p.owner_id IS NOT NULL AND klonk.leads_learner(p.owner_id, p.learn_module))
  )) $$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA klonk FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA klonk TO klonk_user;
--> statement-breakpoint
ALTER POLICY cloud_projects_select ON cloud_projects
  USING (
    owner_id = klonk.current_user_id()
    OR (group_id IS NOT NULL AND (klonk.group_role(group_id) IS NOT NULL OR klonk.can_manage_group(group_id)))
    OR (assignment_id IS NOT NULL AND klonk.leads_group(klonk.assignment_group(assignment_id)))
    OR (learn_module IS NOT NULL AND owner_id IS NOT NULL AND klonk.leads_learner(owner_id, learn_module))
  );
--> statement-breakpoint
-- Modulprojekte nur für Module, die das Konto starten darf (nicht zugleich Abgabe)
ALTER POLICY cloud_projects_insert ON cloud_projects
  WITH CHECK (
    (owner_id = klonk.current_user_id() AND group_id IS NULL
      AND (assignment_id IS NULL OR klonk.group_role(klonk.assignment_group(assignment_id)) IS NOT NULL)
      AND (learn_module IS NULL OR (assignment_id IS NULL AND klonk.can_start_learn_module(learn_module))))
    OR (owner_id IS NULL AND group_id IS NOT NULL AND assignment_id IS NULL AND learn_module IS NULL AND klonk.can_manage_group(group_id))
  );
--> statement-breakpoint
-- Ein Projekt nachträglich zum Modulprojekt machen oder umhängen geht nicht (sonst läse die Gruppenleitung beliebige Projekte)
CREATE OR REPLACE FUNCTION klonk.cloud_project_learn_module(pid uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT learn_module FROM cloud_projects WHERE id = pid $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION klonk.cloud_project_learn_module(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION klonk.cloud_project_learn_module(uuid) TO klonk_user;
--> statement-breakpoint
ALTER POLICY cloud_projects_update ON cloud_projects
  USING (klonk.can_write_cloud_project(id))
  WITH CHECK (klonk.can_write_cloud_project(id) AND learn_module IS NOT DISTINCT FROM klonk.cloud_project_learn_module(id));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON group_learn_modules TO klonk_user;
--> statement-breakpoint
ALTER TABLE group_learn_modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY group_learn_modules_select ON group_learn_modules FOR SELECT TO klonk_user
  USING (klonk.group_role(group_id) IS NOT NULL OR klonk.can_manage_group(group_id));
--> statement-breakpoint
CREATE POLICY group_learn_modules_write ON group_learn_modules FOR ALL TO klonk_user
  USING (klonk.can_manage_group(group_id))
  WITH CHECK (klonk.can_manage_group(group_id));
