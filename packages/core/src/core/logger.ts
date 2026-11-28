/** The logging surface core needs. pino's logger satisfies it (ADR-023). */
export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
};

const noop = (): void => undefined;

export const silentLogger: Logger = { debug: noop, info: noop, warn: noop };
