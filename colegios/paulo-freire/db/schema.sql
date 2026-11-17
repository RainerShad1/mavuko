-- Esquema de la base de datos del colegio (Neon / Postgres)
-- Una base de datos por colegio.

create table if not exists config (
  clave text primary key,
  valor jsonb not null
);

create table if not exists usuarios (
  id serial primary key,
  usuario text unique not null,
  nombre text not null,
  rol text not null default 'secretaria',      -- director | secretaria
  hash text not null,
  sal text not null,
  creado timestamptz not null default now()
);

create table if not exists sesiones (
  token text primary key,
  usuario_id int not null references usuarios(id) on delete cascade,
  expira timestamptz not null
);

create sequence if not exists sec_id;
create sequence if not exists sec_recibo start 1040;

create table if not exists familias (
  id text primary key,
  tutor text not null,
  parentesco text not null default 'Madre',
  tel text not null,                 -- como se muestra: 809-555-1234
  tel_wa text unique not null,       -- como lo envía WhatsApp: 18095551234
  real boolean not null default false, -- true = número real (se le envían mensajes aunque el modo demo esté activo)
  ultimo_aviso text,
  creado timestamptz not null default now()
);

create table if not exists estudiantes (
  id text primary key,
  familia_id text not null references familias(id) on delete cascade,
  nombre text not null,
  grado text not null,
  nivel text not null
);

create table if not exists pagos (
  id serial primary key,
  recibo text not null,
  estudiante_id text not null references estudiantes(id) on delete cascade,
  mes text not null,                 -- 2026-11
  monto int not null,
  fecha timestamptz not null default now(),
  metodo text not null,
  ref text not null default '',
  unique (estudiante_id, mes)
);
create index if not exists pagos_fecha on pagos(fecha desc);

create table if not exists comprobantes (
  id text primary key,
  familia_id text not null references familias(id) on delete cascade,
  estudiante_id text not null references estudiantes(id) on delete cascade,
  meses text[] not null,
  monto int not null,
  banco text,
  ref text,
  fecha timestamptz not null default now(),
  estado text not null default 'pend',  -- pend | ok | bad
  motivo text,
  recibo text,
  via text,
  mime text,
  imagen text                          -- base64 de la foto enviada por WhatsApp
);

create table if not exists ausencias (
  id text primary key,
  estudiante_id text not null references estudiantes(id) on delete cascade,
  familia_id text not null references familias(id) on delete cascade,
  motivo text not null,
  fecha timestamptz not null default now(),
  visto boolean not null default false
);

create table if not exists citas (
  id text primary key,
  familia_id text not null references familias(id) on delete cascade,
  con text not null,
  dia text not null,
  hora text not null,
  estado text not null default 'pend',
  creado timestamptz not null default now()
);

create table if not exists humano (
  id text primary key,
  familia_id text references familias(id) on delete set null,
  nombre text not null,
  tel text not null,
  texto text not null,
  fecha timestamptz not null default now(),
  ok boolean not null default false
);

create table if not exists interesados (
  id text primary key,
  nombre text not null,
  tel text not null,
  grado text not null,
  fecha timestamptz not null default now(),
  estado text not null default 'Nuevo'
);

create table if not exists circulares (
  id text primary key,
  tit text not null,
  msg text not null,
  dest text not null,
  n int not null,
  costo numeric not null,
  fecha timestamptz not null default now(),
  prog boolean not null default false
);

create table if not exists enviados (
  id serial primary key,
  familia_id text references familias(id) on delete cascade,
  tipo text not null,
  fecha timestamptz not null default now(),
  estado text not null default 'Enviado',  -- Enviado | Entregado | Leído | Simulado | Falló
  rec boolean not null default false,
  wamid text
);
create index if not exists enviados_wamid on enviados(wamid);

-- Registro de todos los mensajes de WhatsApp (entrada y salida)
create table if not exists mensajes (
  id bigserial primary key,
  tel text not null,           -- 18095551234
  dir text not null,           -- in | out
  tipo text not null default 'text',
  texto text not null default '',
  wamid text,
  estado text,
  fecha timestamptz not null default now()
);
create index if not exists mensajes_tel on mensajes(tel, fecha desc);
create index if not exists mensajes_wamid on mensajes(wamid);

-- Estado de cada conversación con el bot
create table if not exists wa_sesiones (
  tel text primary key,
  paso text not null default 'menu',
  ctx jsonb not null default '{}',
  actualizado timestamptz not null default now()
);
