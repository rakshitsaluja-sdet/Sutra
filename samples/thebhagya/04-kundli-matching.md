# Business Requirements Document — Kundli Matching (Compatibility)

## 1. Background

The platform offers a traditional 36-Guna (Ashtakoot) compatibility analysis between two people's birth charts, commonly used to assess marriage compatibility in Vedic astrology.

## 2. Requirements

### 2.1 Two-person input

The feature must collect full birth details — name, date of birth, time of birth, and place of birth (via a city search that auto-fills the timezone) — for two separate people, labeled Person 1 and Person 2, using identical input fields for each.

### 2.2 Compatibility score

On successful submission of both people's complete details, the system must compute and display a compatibility score out of a maximum of 36 points, rounded to the nearest half point. A traditional minimum score of 18 out of 36 is considered the threshold for marriage compatibility, and the result must make this threshold clear to the user (e.g., via a verdict label).

### 2.3 Eight Koota breakdown

The result must break the score down across all eight traditional Kootas: Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakut, and Nadi.

### 2.4 Nadi Dosha flag

If both people share the same Nadi (Nadi Dosha), the system must flag this distinctly, since it is considered the most critical incompatibility factor regardless of the overall numeric score.

### 2.5 Error handling

If the computation fails (e.g., incomplete fields for either person, or a backend error), the system must display "Computation failed. Please check all fields." rather than an unrelated or blank error.
