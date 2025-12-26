--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

-- Started on 2025-05-08 23:39:01 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 3431 (class 0 OID 32770)
-- Dependencies: 216
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.companies (id, name, tax_number, address, country, entity_type, contact_name, phone_country_code, phone_number, contact_phone, contact_email, verified, active, logo, website, industry, description, created_at) FROM stdin;
\.


--
-- TOC entry 3433 (class 0 OID 32786)
-- Dependencies: 218
-- Data for Name: connection_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.connection_logs (id, service_name, status, "timestamp", message, response_time, metadata) FROM stdin;
\.


--
-- TOC entry 3439 (class 0 OID 32816)
-- Dependencies: 224
-- Data for Name: executives; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.executives (id, company_id, name, email, phone_number, "position", current_plan, data_usage, data_limit, plan_start_date, plan_end_date, plan_validity) FROM stdin;
\.


--
-- TOC entry 3435 (class 0 OID 32796)
-- Dependencies: 220
-- Data for Name: data_packages; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.data_packages (id, executive_id, gb, cost, purchase_date) FROM stdin;
\.


--
-- TOC entry 3437 (class 0 OID 32803)
-- Dependencies: 222
-- Data for Name: esim_plans; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.esim_plans (id, provider_id, name, description, data, validity, provider_price, selling_price, retail_price, margin, countries, speed, is_active) FROM stdin;
\.


--
-- TOC entry 3449 (class 0 OID 32869)
-- Dependencies: 234
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.subscriptions (id, company_id, plan, status, start_date, end_date, amount) FROM stdin;
\.


--
-- TOC entry 3441 (class 0 OID 32828)
-- Dependencies: 226
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.payments (id, company_id, subscription_id, amount, status, payment_date, payment_method) FROM stdin;
\.


--
-- TOC entry 3443 (class 0 OID 32838)
-- Dependencies: 228
-- Data for Name: plan_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.plan_history (id, executive_id, plan_name, plan_data, start_date, end_date, data_used, status, provider_id) FROM stdin;
\.


--
-- TOC entry 3445 (class 0 OID 32848)
-- Dependencies: 230
-- Data for Name: purchased_esims; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.purchased_esims (id, executive_id, plan_id, order_id, iccid, activation_code, qr_code, status, purchase_date, activation_date, expiry_date, data_used, metadata) FROM stdin;
\.


--
-- TOC entry 3447 (class 0 OID 32859)
-- Dependencies: 232
-- Data for Name: server_connections; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.server_connections (id, service_name, status, response_time, last_checked, message, metadata) FROM stdin;
\.


--
-- TOC entry 3451 (class 0 OID 32880)
-- Dependencies: 236
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, email, password, is_admin, is_super_admin, company_id, is_verified, verification_token, verification_token_expiry, created_at) FROM stdin;
\.


--
-- TOC entry 3455 (class 0 OID 32908)
-- Dependencies: 240
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.wallets (id, company_id, balance, last_updated) FROM stdin;
\.


--
-- TOC entry 3453 (class 0 OID 32897)
-- Dependencies: 238
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.wallet_transactions (id, wallet_id, amount, type, description, stripe_payment_id, stripe_session_id, stripe_payment_intent_id, status, payment_method, created_at) FROM stdin;
\.


--
-- TOC entry 3461 (class 0 OID 0)
-- Dependencies: 215
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.companies_id_seq', 1, false);


--
-- TOC entry 3462 (class 0 OID 0)
-- Dependencies: 217
-- Name: connection_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.connection_logs_id_seq', 1, false);


--
-- TOC entry 3463 (class 0 OID 0)
-- Dependencies: 219
-- Name: data_packages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.data_packages_id_seq', 1, false);


--
-- TOC entry 3464 (class 0 OID 0)
-- Dependencies: 221
-- Name: esim_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.esim_plans_id_seq', 1, false);


--
-- TOC entry 3465 (class 0 OID 0)
-- Dependencies: 223
-- Name: executives_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.executives_id_seq', 1, false);


--
-- TOC entry 3466 (class 0 OID 0)
-- Dependencies: 225
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- TOC entry 3467 (class 0 OID 0)
-- Dependencies: 227
-- Name: plan_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.plan_history_id_seq', 1, false);


--
-- TOC entry 3468 (class 0 OID 0)
-- Dependencies: 229
-- Name: purchased_esims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.purchased_esims_id_seq', 1, false);


--
-- TOC entry 3469 (class 0 OID 0)
-- Dependencies: 231
-- Name: server_connections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.server_connections_id_seq', 1, false);


--
-- TOC entry 3470 (class 0 OID 0)
-- Dependencies: 233
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 1, false);


--
-- TOC entry 3471 (class 0 OID 0)
-- Dependencies: 235
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


--
-- TOC entry 3472 (class 0 OID 0)
-- Dependencies: 237
-- Name: wallet_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.wallet_transactions_id_seq', 1, false);


--
-- TOC entry 3473 (class 0 OID 0)
-- Dependencies: 239
-- Name: wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.wallets_id_seq', 1, false);


-- Completed on 2025-05-08 23:39:03 UTC

--
-- PostgreSQL database dump complete
--

