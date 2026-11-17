-- 測試用的三個使用者。套用 migration 之後執行，profiles 由 handle_new_user 建立。
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (tests.user_id('owner'), 'owner@example.com',
   '{"full_name": "小林", "avatar_url": "https://example.com/owner.png"}'),
  (tests.user_id('member'), 'member@example.com', '{"full_name": "阿美"}'),
  (tests.user_id('outsider'), 'outsider@example.com', '{}');
