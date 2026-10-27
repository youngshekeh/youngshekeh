-- V322 synthetic pg_net, in a disposable PostgreSQL database only.
CREATE SCHEMA net;
CREATE TABLE net.http_request_queue(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);
CREATE TABLE net._http_response(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz
);
