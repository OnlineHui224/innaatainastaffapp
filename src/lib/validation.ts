import type { PilgrimInput } from '@/types';
import { compareDates, todayStr } from './status';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+\d\s().-]{7,20}$/;

export function validatePilgrim(
  input: PilgrimInput,
  opts: { isUpdate?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];

  if (!input.full_name?.trim()) {
    errors.push('Full name is required.');
  }

  if (!input.passport_number?.trim()) {
    errors.push('Passport number is required.');
  }

  if (!input.nationality?.trim()) {
    errors.push('Nationality is required.');
  }

  if (!input.expected_departure_date) {
    errors.push('Expected departure date is required.');
  }

  if (input.phone_number && !phoneRegex.test(input.phone_number)) {
    errors.push('Phone number format is not valid.');
  }

  // Date order validations
  if (
    input.arrival_date &&
    input.expected_departure_date &&
    compareDates(input.expected_departure_date, input.arrival_date) < 0
  ) {
    errors.push('Expected departure date cannot be earlier than the arrival date.');
  }

  if (
    input.arrival_date &&
    input.actual_departure_date &&
    compareDates(input.actual_departure_date, input.arrival_date) < 0
  ) {
    errors.push('Actual departure date cannot be earlier than the arrival date.');
  }

  if (
    input.expected_departure_date &&
    input.actual_departure_date &&
    compareDates(input.actual_departure_date, input.expected_departure_date) < 0
  ) {
    errors.push('Actual departure date cannot be earlier than the expected departure date.');
  }

  void opts;
  void todayStr;
  return { valid: errors.length === 0, errors };
}

export function validateEmail(email: string): boolean {
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  return phoneRegex.test(phone);
}

export function friendlyError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message).toLowerCase();
    if (msg.includes('pilgrims_passport_number_unique_idx') || msg.includes('duplicate key')) {
      return 'A pilgrim with this passport number already exists. Passport numbers must be unique.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Your email has not been confirmed. Please contact an administrator.';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
  }
  return 'Something went wrong. Please try again. If the problem persists, contact an administrator.';
}
