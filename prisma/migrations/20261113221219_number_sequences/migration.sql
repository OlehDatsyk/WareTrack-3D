-- Race-free human-readable document numbers (seed data uses lower numbers).
CREATE SEQUENCE IF NOT EXISTS task_number_seq START 7000;
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 11000;
CREATE SEQUENCE IF NOT EXISTS shipment_number_seq START 79000;
CREATE SEQUENCE IF NOT EXISTS pallet_number_seq START 3000;
