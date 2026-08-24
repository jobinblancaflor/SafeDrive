-- 0013_seller_role.sql
-- Adds "seller" to the user_role enum. Kept in its own migration because a
-- new enum value can't be used in the same transaction that adds it.
alter type user_role add value if not exists 'seller';
