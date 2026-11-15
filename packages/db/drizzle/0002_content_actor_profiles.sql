CREATE TABLE `content_actor_profiles` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT "content_actor_profiles_role_check" CHECK("content_actor_profiles"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
INSERT INTO content_actor_profiles (actor_id, display_name, role)
SELECT id, name, role FROM user;
--> statement-breakpoint
CREATE TRIGGER content_actor_profiles_insert AFTER INSERT ON user
BEGIN
  INSERT INTO content_actor_profiles (actor_id, display_name, role)
  VALUES (NEW.id, NEW.name, NEW.role)
  ON CONFLICT (actor_id) DO UPDATE SET display_name = excluded.display_name, role = excluded.role;
END;
--> statement-breakpoint
CREATE TRIGGER content_actor_profiles_update AFTER UPDATE OF id, name, role ON user
WHEN OLD.id IS NOT NEW.id OR OLD.name IS NOT NEW.name OR OLD.role IS NOT NEW.role
BEGIN
  DELETE FROM content_actor_profiles WHERE actor_id = OLD.id AND OLD.id IS NOT NEW.id;
  INSERT INTO content_actor_profiles (actor_id, display_name, role)
  VALUES (NEW.id, NEW.name, NEW.role)
  ON CONFLICT (actor_id) DO UPDATE SET display_name = excluded.display_name, role = excluded.role;
END;
--> statement-breakpoint
CREATE TRIGGER content_actor_profiles_delete AFTER DELETE ON user
BEGIN
  DELETE FROM content_actor_profiles WHERE actor_id = OLD.id;
END;
