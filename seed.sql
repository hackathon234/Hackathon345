-- Optional demo data. Run AFTER schema.sql:
--   psql -d amani_db -f backend/seed.sql
-- Demo password for every seeded account is: Passw0rd!  (bcrypt hash below)

BEGIN;

INSERT INTO users (id, name, email, password_hash, role, county, constituency, sub_county)
VALUES
  ('11111111-1111-1111-1111-111111111111','Dr. Wanjiru Kamau','wanjiru@amani.demo','$2a$10$1a0jz7fT2m4c2qk1kq5v9uV3oQ8n7VYV0m0p8m0O1x1x1x1x1x1xO','professional','Nairobi','Westlands','Westlands'),
  ('22222222-2222-2222-2222-222222222222','Brian Otieno','brian@amani.demo','$2a$10$1a0jz7fT2m4c2qk1kq5v9uV3oQ8n7VYV0m0p8m0O1x1x1x1x1x1xO','volunteer','Kiambu','Ruiru','Ruiru'),
  ('33333333-3333-3333-3333-333333333333','Faith Njeri','faith@amani.demo','$2a$10$1a0jz7fT2m4c2qk1kq5v9uV3oQ8n7VYV0m0p8m0O1x1x1x1x1x1xO','mentor','Mombasa','Nyali','Nyali'),
  ('44444444-4444-4444-4444-444444444444','Kisumu Wellness Trust','organizer@amani.demo','$2a$10$1a0jz7fT2m4c2qk1kq5v9uV3oQ8n7VYV0m0p8m0O1x1x1x1x1x1xO','organizer','Kisumu','Kisumu Central','Kisumu Central'),
  ('55555555-5555-5555-5555-555555555555','Achieng Otieno','achieng@amani.demo','$2a$10$1a0jz7fT2m4c2qk1kq5v9uV3oQ8n7VYV0m0p8m0O1x1x1x1x1x1xO','user','Nairobi','Westlands','Westlands')
ON CONFLICT (email) DO NOTHING;

INSERT INTO sessions (host_id, kind, title, description, duration_minutes, price) VALUES
  ('11111111-1111-1111-1111-111111111111','professional','1:1 Anxiety Check-in','A focused session to talk through what is on your mind with a licensed professional.',45,2500),
  ('22222222-2222-2222-2222-222222222222','volunteer','Peer Listening Session','A free, judgment-free space to be heard by a trained volunteer.',30,0),
  ('33333333-3333-3333-3333-333333333333','mentor','Study Stress Mentorship','Guidance for students navigating academic pressure.',40,0)
ON CONFLICT DO NOTHING;

INSERT INTO listings (organizer_id, type, title, description, county, constituency, sub_county, event_date, price) VALUES
  ('44444444-4444-4444-4444-444444444444','event','Community Wellness Fair','A day of free screenings, talks and peer support booths.','Nairobi','Westlands','Westlands','2026-10-04',500),
  ('44444444-4444-4444-4444-444444444444','event','Men''s Circle: Breaking Silence','An honest conversation on masculinity and mental health.','Kiambu','Ruiru','Ruiru','2026-10-11',300),
  ('44444444-4444-4444-4444-444444444444','gathering','Grief Support Walk-In','A free, drop-in circle for anyone processing loss.','Kisumu','Kisumu Central','Kisumu Central','2026-09-28',0),
  ('44444444-4444-4444-4444-444444444444','gathering','New Parents Peer Group','Weekly free gathering for parents adjusting to a new baby.','Nakuru','Naivasha','Naivasha','2026-10-02',0)
ON CONFLICT DO NOTHING;

COMMIT;
