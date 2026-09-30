-- Runs automatically on first container start (docker-entrypoint-initdb.d)
-- so the test database exists alongside the dev one without a manual step.
CREATE DATABASE mediconnect_test OWNER mediconnect;
