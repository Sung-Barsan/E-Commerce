# Project overview

## Problem statement

Small academic commerce projects often demonstrate disconnected CRUD screens without explaining trust boundaries, concurrent inventory changes or role ownership. NEXORA combines these ideas in a single local demonstration.

## Objectives

Deliver a responsive EJS storefront, persist customer state in MongoDB, enforce role permissions on the server, and simulate payment and fulfillment without moving money. Teach transactional data integrity, session security and event-driven user updates.

## Existing versus proposed approach

| Basic classroom approach | NEXORA approach |
|---|---|
| Browser-side price calculations trusted | Prices reloaded from MongoDB during checkout |
| Hidden admin menu used as authorization | Role middleware on protected routes |
| One generic dashboard | Customer, seller and administrator workflows |
| Decrement stock after recording order | Transaction covers order, stock, payment, cart and notification records |
| Real gateway required | Explicit simulated payment outcomes |

## Scope and requirements

Node.js 24, npm, modern browser and local MongoDB Community Server replica set. No Docker is required. The user's Windows 11 / WSL2 development setup is supported by the documented workflow. An 8 GB laptop can run a small local demonstration, but actual resource use depends on browser tabs, MongoDB cache and other applications; no benchmark is claimed.

Project scope and known unfinished modules are tracked in FEATURE_STATUS.md. This is a portfolio/college demonstration, not a public commerce deployment or a real-money gateway.
