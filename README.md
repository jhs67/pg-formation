# pg-formation

Node.js stateful database schema management tool built exclusively for postgres.

With many migration tools you specify the changes to your schema.
With pg-formation you specify the final schema and pg-formation infers
the changes.

Please check out the important [caveats](#Caveats).

## Installation

	$ npm install pg-formation

Installing this module locally adds an executable file into your `node_modules/.bin` directory.
Use node_modules/.bin/pg-formation to run the program if installed this way. You can use
the `-g` option to `npm` to install globally and use `pg-formation` to run the program.

## Usage

```
pg-formation [command]

Commands:
  pg-formation dump  - Dump the contents of an existing database

Options:
  --version              Show version number                           [boolean]
  -d, --database-url     database connection url                        [string]
  -t, --config-format    Output format for dump or override input format
                        [string] [choices: "js", "json", "yaml"] [default: "js"]
  -s, --database-schema  The schema to run the migration
                                                    [string] [default: "public"]
  --help                 Show help                                     [boolean]
```

If the `--database-url` option is not provided then the `DATABASE_URL` environment variable
will be consulted. If both are missing the connection will be attempted assuming
the environment is set up using the standard
[postgres environment variables](https://www.postgresql.org/docs/9.1/static/libpq-envars.html).

### pg-formation dump

The dump command will scan the schema from the database and output the result
to standard output. Use this method to bootstrap the process if there is
an existing database schema. See the important [caveats](#Caveats).

## Caveats

This tool is currently alpha quality at best. Please consider carefully if you
wish to use if for production deployments.

This tool only understands a subset of the possible postgres schemas. If you
use this tool with an existing schema that is not understood then calamity
is almost sure to follow.
