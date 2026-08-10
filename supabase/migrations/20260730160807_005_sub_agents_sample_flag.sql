
/*
# Add is_sample_data column to sub_agents

1. Purpose
   Allows the sample-data reset workflow to safely identify fictional sub-agents
   without deleting genuine ones.

2. Modified Tables
   - `sub_agents`
     - adds `is_sample_data` boolean NOT NULL DEFAULT false

3. Security
   - No policy changes needed.
*/

ALTER TABLE sub_agents ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sub_agents_sample_idx ON sub_agents (is_sample_data);
