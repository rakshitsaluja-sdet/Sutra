# Business Requirements Document — Numerology Calculator

## 1. Background

The platform offers a standalone numerology calculator that derives a set of numerological readings from a person's full birth name and date of birth, independent of the full astrological birth chart feature.

## 2. Requirements

### 2.1 Required inputs

The calculator must require the user's full birth name (as on their birth certificate) and date of birth. If either is missing when the user submits, the system must show "Name and date of birth are required." and not proceed with the calculation.

### 2.2 Optional partner comparison

The user must be able to optionally reveal a second set of fields (partner's full name and partner's date of birth) to include a compatibility comparison alongside their own reading. This section must remain hidden until the user chooses to add a partner, and is not required to get a result for themselves alone.

### 2.3 Result contents

On successful calculation, the system must display: a Birthday Number, a Personal Year number (with its associated meaning), a Destiny number calculated under both the Pythagorean (Western) and Chaldean (ancient) systems, a Soul Urge number under both systems, and a Personality number under both systems.

### 2.4 Error handling

If the calculation fails for any reason (e.g., backend error), the system must display the error message returned rather than a blank or silently failed result.
