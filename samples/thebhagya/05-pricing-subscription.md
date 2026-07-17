# Business Requirements Document — Pricing and Subscription

## 1. Background

The platform offers tiered subscription plans (Free, Jyotish, Guru) that unlock progressively more astrological features. This document describes the requirements for the pricing page and checkout initiation.

## 2. Requirements

### 2.1 Plan display

The pricing page must display all available plans, including at minimum a Free tier (₹0) and paid tiers Jyotish (₹299) and Guru (₹799), with each paid tier's benefits described relative to the tier below it (e.g., "Everything in Jyotish, plus...").

### 2.2 Free plan selection

Selecting the Free plan must not initiate any payment checkout flow, since no payment is required.

### 2.3 Paid plan checkout

Selecting a paid plan (Jyotish or Guru) must initiate a checkout flow for that specific plan. While checkout is being initiated, the system must show a loading state scoped to the selected plan only, not the whole page.

### 2.4 Checkout outcome

After checkout completes, the system must reflect a clear success or failure state for that plan's payment attempt, so the user knows whether their subscription was activated.

### 2.5 Refund policy visibility

The refund policy (a 7-day refund window for first-time Jyotish/Guru subscribers) must be visible to the user before or during checkout, not only after payment.
