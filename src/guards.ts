import type { FlexibleRecord } from "./types.js";

export const isRecord = (value: unknown): value is FlexibleRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

export const getRecord = (value: unknown): FlexibleRecord | undefined =>
  isRecord(value) ? value : undefined;

export const getString = (
  record: FlexibleRecord | undefined,
  key: string,
): string | undefined => {
  const value = record?.[key];
  return isString(value) ? value : undefined;
};

export const getNumber = (
  record: FlexibleRecord | undefined,
  key: string,
): number | undefined => {
  const value = record?.[key];
  return isNumber(value) ? value : undefined;
};

export const getRecordValue = (
  record: FlexibleRecord | undefined,
  key: string,
): FlexibleRecord | undefined => {
  const value = record?.[key];
  return getRecord(value);
};

export const getUnknown = (
  record: FlexibleRecord | undefined,
  key: string,
): unknown => record?.[key];

export const getRecordArray = (
  record: FlexibleRecord | undefined,
  key: string,
): FlexibleRecord[] => {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
};

export const parseJsonRecord = (
  text: string,
  label = "JSON payload",
): FlexibleRecord => {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
};
