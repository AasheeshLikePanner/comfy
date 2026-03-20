# Cleo 🐱

Local PostgreSQL visualizer - explore your database schema in a beautiful web interface.

```
      .----.
     /  /\  \
    |  /  \  |
     \/    \/
      |    |
     /| /\ |\
    / |/  \| \
   /__|    |__\
      |    |
      \____/
```

## Installation

```bash
npm install -g cleo
```

## Usage

### Quick Start

```bash
cleo
```

### Commands

```bash
cleo              # Start or open existing instance
cleo start        # Force start server
cleo start <url>  # Start with connection string
cleo stop         # Stop running server
cleo --help       # Show help
```

### Connect with URL

```bash
cleo postgres://user:password@localhost:5432/mydb
```

### Auto-detection

Cleo auto-detects your PostgreSQL connection from:
- `DATABASE_URL` environment variable
- `.env` file with `DATABASE_URL` or `PG_*` variables
- PostgreSQL environment variables

## Requirements

- Node.js >= 18.0.0
- PostgreSQL database

## License

MIT
