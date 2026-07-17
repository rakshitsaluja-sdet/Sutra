# Business Requirements Document — Birth Chart Generation

## 1. Background

The core feature of the platform is generating a personalized astrological birth chart from a user's birth details. This document describes the requirements for the chart-request form.

## 2. Requirements

### 2.1 Required birth details

The chart form must collect the following required fields: date of birth, time of birth, and place of birth. Place of birth must be entered via a searchable city lookup with autocomplete suggestions — free-text place names without a selected suggestion are not sufficient, since the system needs precise latitude/longitude coordinates. If the user attempts to submit without selecting a place from the suggestions (i.e., no coordinates captured), the system must show "Please select a place of birth from the suggestions." and not submit the form.

### 2.2 Timezone

The form must include a timezone selector, defaulting to Asia/Kolkata, covering major timezones relevant to the platform's user base (India, Pakistan, Bangladesh, Nepal, North America, UK, Germany, UAE, Singapore, Australia, New Zealand).

### 2.3 Optional label

Users must be able to optionally provide a label for the chart (e.g., "My Chart", "Mom's Chart") to help distinguish between multiple saved charts, but this field is not required to generate a chart.

### 2.4 Successful generation

On successful submission with all required fields and a validated place selection, the system must generate the chart and navigate the user to the chart result view.
