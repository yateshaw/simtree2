--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name text NOT NULL,
    tax_number text,
    address text,
    country text,
    entity_type text,
    contact_name text,
    phone_country_code text,
    phone_number text,
    contact_phone text,
    contact_email text,
    verified boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    logo text,
    website text,
    industry text,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO neondb_owner;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO neondb_owner;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: connection_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connection_logs (
    id integer NOT NULL,
    service_name text NOT NULL,
    status text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    message text,
    response_time integer,
    metadata jsonb
);


ALTER TABLE public.connection_logs OWNER TO neondb_owner;

--
-- Name: connection_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.connection_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.connection_logs_id_seq OWNER TO neondb_owner;

--
-- Name: connection_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.connection_logs_id_seq OWNED BY public.connection_logs.id;


--
-- Name: data_packages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.data_packages (
    id integer NOT NULL,
    executive_id integer,
    gb numeric(10,2) NOT NULL,
    cost numeric(10,2) NOT NULL,
    purchase_date date NOT NULL
);


ALTER TABLE public.data_packages OWNER TO neondb_owner;

--
-- Name: data_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.data_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.data_packages_id_seq OWNER TO neondb_owner;

--
-- Name: data_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.data_packages_id_seq OWNED BY public.data_packages.id;


--
-- Name: esim_plans; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.esim_plans (
    id integer NOT NULL,
    provider_id text NOT NULL,
    name text NOT NULL,
    description text,
    data numeric(10,2) NOT NULL,
    validity integer NOT NULL,
    provider_price numeric(10,2) NOT NULL,
    selling_price numeric(10,2) NOT NULL,
    retail_price numeric(10,2) NOT NULL,
    margin numeric(10,2) DEFAULT '100'::numeric NOT NULL,
    countries text[],
    speed text,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.esim_plans OWNER TO neondb_owner;

--
-- Name: esim_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.esim_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.esim_plans_id_seq OWNER TO neondb_owner;

--
-- Name: esim_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.esim_plans_id_seq OWNED BY public.esim_plans.id;


--
-- Name: executives; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.executives (
    id integer NOT NULL,
    company_id integer,
    name text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone_number text NOT NULL,
    "position" text NOT NULL,
    current_plan text,
    data_usage numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    data_limit numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    plan_start_date timestamp without time zone,
    plan_end_date timestamp without time zone,
    plan_validity integer
);


ALTER TABLE public.executives OWNER TO neondb_owner;

--
-- Name: executives_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.executives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.executives_id_seq OWNER TO neondb_owner;

--
-- Name: executives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.executives_id_seq OWNED BY public.executives.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    company_id integer,
    subscription_id integer,
    amount numeric(10,2) NOT NULL,
    status text NOT NULL,
    payment_date timestamp without time zone DEFAULT now() NOT NULL,
    payment_method text
);


ALTER TABLE public.payments OWNER TO neondb_owner;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO neondb_owner;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: plan_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.plan_history (
    id integer NOT NULL,
    executive_id integer,
    plan_name text NOT NULL,
    plan_data numeric(10,2) NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    data_used numeric(10,2) DEFAULT '0'::numeric,
    status text NOT NULL,
    provider_id text NOT NULL
);


ALTER TABLE public.plan_history OWNER TO neondb_owner;

--
-- Name: plan_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.plan_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plan_history_id_seq OWNER TO neondb_owner;

--
-- Name: plan_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.plan_history_id_seq OWNED BY public.plan_history.id;


--
-- Name: purchased_esims; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.purchased_esims (
    id integer NOT NULL,
    executive_id integer,
    plan_id integer,
    order_id text NOT NULL,
    iccid text NOT NULL,
    activation_code text,
    qr_code text,
    status text NOT NULL,
    purchase_date timestamp without time zone DEFAULT now() NOT NULL,
    activation_date timestamp without time zone,
    expiry_date timestamp without time zone,
    data_used numeric(10,2) DEFAULT '0'::numeric,
    metadata jsonb
);


ALTER TABLE public.purchased_esims OWNER TO neondb_owner;

--
-- Name: purchased_esims_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.purchased_esims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.purchased_esims_id_seq OWNER TO neondb_owner;

--
-- Name: purchased_esims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.purchased_esims_id_seq OWNED BY public.purchased_esims.id;


--
-- Name: server_connections; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.server_connections (
    id integer NOT NULL,
    service_name text NOT NULL,
    status text NOT NULL,
    response_time integer,
    last_checked timestamp without time zone DEFAULT now() NOT NULL,
    message text,
    metadata jsonb
);


ALTER TABLE public.server_connections OWNER TO neondb_owner;

--
-- Name: server_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.server_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.server_connections_id_seq OWNER TO neondb_owner;

--
-- Name: server_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.server_connections_id_seq OWNED BY public.server_connections.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    company_id integer,
    plan text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    start_date timestamp without time zone DEFAULT now() NOT NULL,
    end_date timestamp without time zone,
    amount numeric(10,2) NOT NULL
);


ALTER TABLE public.subscriptions OWNER TO neondb_owner;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscriptions_id_seq OWNER TO neondb_owner;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL,
    company_id integer,
    is_verified boolean DEFAULT false NOT NULL,
    verification_token text,
    verification_token_expiry timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.wallet_transactions (
    id integer NOT NULL,
    wallet_id integer,
    amount numeric(10,2) NOT NULL,
    type text NOT NULL,
    description text,
    stripe_payment_id text,
    stripe_session_id text,
    stripe_payment_intent_id text,
    status text DEFAULT 'completed'::text NOT NULL,
    payment_method text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wallet_transactions OWNER TO neondb_owner;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallet_transactions_id_seq OWNER TO neondb_owner;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.wallets (
    id integer NOT NULL,
    company_id integer,
    balance numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    last_updated timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wallets OWNER TO neondb_owner;

--
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallets_id_seq OWNER TO neondb_owner;

--
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: connection_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connection_logs ALTER COLUMN id SET DEFAULT nextval('public.connection_logs_id_seq'::regclass);


--
-- Name: data_packages id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_packages ALTER COLUMN id SET DEFAULT nextval('public.data_packages_id_seq'::regclass);


--
-- Name: esim_plans id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.esim_plans ALTER COLUMN id SET DEFAULT nextval('public.esim_plans_id_seq'::regclass);


--
-- Name: executives id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.executives ALTER COLUMN id SET DEFAULT nextval('public.executives_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: plan_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_history ALTER COLUMN id SET DEFAULT nextval('public.plan_history_id_seq'::regclass);


--
-- Name: purchased_esims id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.purchased_esims ALTER COLUMN id SET DEFAULT nextval('public.purchased_esims_id_seq'::regclass);


--
-- Name: server_connections id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.server_connections ALTER COLUMN id SET DEFAULT nextval('public.server_connections_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.companies (id, name, tax_number, address, country, entity_type, contact_name, phone_country_code, phone_number, contact_phone, contact_email, verified, active, logo, website, industry, description, created_at) FROM stdin;
1	Simtree	SIMTREE-TAX-1234	123 Corporate Drive	Global	Corporation	System Administrator	\N	\N	+1-555-SIMTREE	superadmin@esimplatform.com	t	t	\N	https://simtree.global	Telecommunications	System administrator company	2025-05-08 23:33:59.493919
\.


--
-- Data for Name: connection_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.connection_logs (id, service_name, status, "timestamp", message, response_time, metadata) FROM stdin;
1	esim-access-api	warning	2025-05-08 23:34:00.711	Slow service: 847ms	847	\N
\.


--
-- Data for Name: data_packages; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.data_packages (id, executive_id, gb, cost, purchase_date) FROM stdin;
\.


--
-- Data for Name: esim_plans; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.esim_plans (id, provider_id, name, description, data, validity, provider_price, selling_price, retail_price, margin, countries, speed, is_active) FROM stdin;
\.


--
-- Data for Name: executives; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.executives (id, company_id, name, email, phone_number, "position", current_plan, data_usage, data_limit, plan_start_date, plan_end_date, plan_validity) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.payments (id, company_id, subscription_id, amount, status, payment_date, payment_method) FROM stdin;
\.


--
-- Data for Name: plan_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.plan_history (id, executive_id, plan_name, plan_data, start_date, end_date, data_used, status, provider_id) FROM stdin;
\.


--
-- Data for Name: purchased_esims; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.purchased_esims (id, executive_id, plan_id, order_id, iccid, activation_code, qr_code, status, purchase_date, activation_date, expiry_date, data_used, metadata) FROM stdin;
\.


--
-- Data for Name: server_connections; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.server_connections (id, service_name, status, response_time, last_checked, message, metadata) FROM stdin;
1	database	online	68	2025-05-08 23:33:59.661	\N	\N
3	stripe-api	online	3	2025-05-08 23:33:59.945	\N	\N
2	email-service	online	3	2025-05-08 23:33:59.944	\N	\N
4	esim-access-api	warning	847	2025-05-08 23:34:00.447	Slow service: 847ms	\N
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.subscriptions (id, company_id, plan, status, start_date, end_date, amount) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, email, password, is_admin, is_super_admin, company_id, is_verified, verification_token, verification_token_expiry, created_at) FROM stdin;
1	sadmin	superadmin@esimplatform.com	b6013c926cf12faf9e28ed340e2d2a5e.bc8157fbb1affd6642421880dc3fcb1d6f18b69db72e13b784599854f9f292de	t	t	1	t	\N	\N	2025-05-08 23:33:59.536941
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.wallet_transactions (id, wallet_id, amount, type, description, stripe_payment_id, stripe_session_id, stripe_payment_intent_id, status, payment_method, created_at) FROM stdin;
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.wallets (id, company_id, balance, last_updated) FROM stdin;
\.


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.companies_id_seq', 1, true);


--
-- Name: connection_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.connection_logs_id_seq', 1, true);


--
-- Name: data_packages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.data_packages_id_seq', 1, false);


--
-- Name: esim_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.esim_plans_id_seq', 1, false);


--
-- Name: executives_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.executives_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: plan_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.plan_history_id_seq', 1, false);


--
-- Name: purchased_esims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.purchased_esims_id_seq', 1, false);


--
-- Name: server_connections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.server_connections_id_seq', 4, true);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.subscriptions_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.wallet_transactions_id_seq', 1, false);


--
-- Name: wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.wallets_id_seq', 1, false);


--
-- Name: companies companies_name_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_name_unique UNIQUE (name);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_tax_number_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_tax_number_unique UNIQUE (tax_number);


--
-- Name: connection_logs connection_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connection_logs
    ADD CONSTRAINT connection_logs_pkey PRIMARY KEY (id);


--
-- Name: data_packages data_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_packages
    ADD CONSTRAINT data_packages_pkey PRIMARY KEY (id);


--
-- Name: esim_plans esim_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.esim_plans
    ADD CONSTRAINT esim_plans_pkey PRIMARY KEY (id);


--
-- Name: esim_plans esim_plans_provider_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.esim_plans
    ADD CONSTRAINT esim_plans_provider_id_unique UNIQUE (provider_id);


--
-- Name: executives executives_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.executives
    ADD CONSTRAINT executives_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: plan_history plan_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_history
    ADD CONSTRAINT plan_history_pkey PRIMARY KEY (id);


--
-- Name: purchased_esims purchased_esims_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.purchased_esims
    ADD CONSTRAINT purchased_esims_pkey PRIMARY KEY (id);


--
-- Name: server_connections server_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.server_connections
    ADD CONSTRAINT server_connections_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: data_packages data_packages_executive_id_executives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_packages
    ADD CONSTRAINT data_packages_executive_id_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.executives(id);


--
-- Name: executives executives_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.executives
    ADD CONSTRAINT executives_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: payments payments_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: payments payments_subscription_id_subscriptions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_subscription_id_subscriptions_id_fk FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: plan_history plan_history_executive_id_executives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_history
    ADD CONSTRAINT plan_history_executive_id_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.executives(id);


--
-- Name: purchased_esims purchased_esims_executive_id_executives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.purchased_esims
    ADD CONSTRAINT purchased_esims_executive_id_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.executives(id);


--
-- Name: purchased_esims purchased_esims_plan_id_esim_plans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.purchased_esims
    ADD CONSTRAINT purchased_esims_plan_id_esim_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.esim_plans(id);


--
-- Name: subscriptions subscriptions_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: users users_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: wallet_transactions wallet_transactions_wallet_id_wallets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_wallets_id_fk FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);


--
-- Name: wallets wallets_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

