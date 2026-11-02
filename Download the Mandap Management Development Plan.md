# Mandap Management Platform

## Product Requirements and Development Plan

**Document version:** 1.0  
**Product type:** Multi-tenant, mobile-first Progressive Web App (PWA)  
**Primary use cases:** Navratri, Durga Puja, Ganesh Chaturthi, temple events, apartment-community festivals, and other Mandap activities

### Approved Low-Cost Pilot Architecture

The initial pilot uses **React + TypeScript + Vite PWA on Cloudflare Pages**, with
**Supabase PostgreSQL, Auth, private Storage, transactional database functions,
and narrow Edge Functions** as its backend. This supersedes section 15's
Next.js/ASP.NET Core/Redis/Azure recommendation for the pilot.

- One pilot Mandap, with multi-tenant isolation from the beginning.
- Email-code sign-in initially; mobile OTP later.
- Reuse the web UI through Capacitor for Android and iOS later.
- Cash/static UPI, authorized manual verification, and printable receipts first.
- Daily database backups plus independent encrypted file/database recovery copies;
  point-in-time recovery is not included in the accepted pilot budget.
- Target hosting/database budget: INR 1,000-3,000/month, subject to tax, exchange
  rates, usage, and email limits. No paid resources have been provisioned.

See [README](./README.md) for implementation, setup, pricing semantics, explicit
limitations, and release gates. The remaining sections describe the broader
product vision, not a claim that every feature is already implemented.

**Local-development update:** The frontend now uses Mantine and a responsive
dark workspace design. Without hosted credentials it connects to a loopback-only
Node API with disk-backed PGlite PostgreSQL, reusing the same financial and
authorization functions. Local sign-in uses a labelled development inbox;
this is not production identity verification or public financial hosting.

---

## 1. Product Vision

Build a configurable platform where any Mandap, temple committee, apartment association, or festival organizer can:

1. Register and create a private Mandap workspace.
2. Create one or more festivals or events.
3. Configure daily, recurring, and special poojas.
4. Register devotees and family members.
5. Track donation commitments and actual payments.
6. Manage prasadam and other sponsorships.
7. Record, approve, and publish expenses.
8. Give controlled access to committee members.
9. Provide financial transparency without exposing private personal information.
10. Operate effectively on mobile, tablet, and desktop.

### Product Positioning

> A configurable festival and Mandap management platform for pooja registrations, donations, sponsorships, expenses, and committee operations.

---

## 2. Product Principles

1. **Mandap-specific configuration:** Do not hard-code festival types, pooja names, prices, or sponsorship categories.
2. **Mobile first:** Every important organizer and devotee workflow must work well on a phone.
3. **Financial traceability:** Commitments, payments, refunds, and expenses must have complete histories.
4. **Privacy:** Public reports must not expose mobile numbers, addresses, payment status, or private donor information.
5. **Role-based access:** Committee members should only access the capabilities assigned to them.
6. **Multi-tenant isolation:** One Mandap must never be able to access another Mandap's data.
7. **Simple operations:** Volunteers must be able to register people and update payments with minimal training.
8. **Configurable transparency:** Each Mandap decides which approved financial summaries are visible publicly.

---

## 3. Multi-Tenant Platform Structure

Each registered Mandap gets an isolated workspace and a public URL.

Examples:

```text
appname.in/sri-durga-mandap
appname.in/ganesh-utsav-2027
appname.in/navratri-serilingampally
```

### Platform Hierarchy

```text
Platform
└── Mandap
    ├── Mandap Settings
    ├── Committee Members
    ├── Roles and Permissions
    ├── Festivals
    │   ├── Festival Days
    │   ├── Poojas
    │   ├── Sponsorships
    │   └── Announcements
    ├── Devotees and Families
    ├── Registrations
    ├── Donation Commitments
    ├── Payments and Receipts
    ├── Expenses and Approvals
    ├── Reports
    └── Audit Logs
```

A Mandap must be able to run multiple festivals over time, such as:

- Navratri 2027
- Ganesh Chaturthi 2027
- Annual Chandi Homam
- Saraswati Puja
- Community Satyanarayana Vratham

---

## 4. User Roles and Permissions

### 4.1 Platform Administrator

The platform administrator manages the overall SaaS application.

Capabilities:

- View registered Mandaps.
- Approve, activate, suspend, or archive Mandaps.
- Manage subscriptions and plans.
- View platform usage and operational health.
- Configure platform-wide settings.
- Help with support and account recovery.
- Review platform-level security and audit events.

The platform administrator should not routinely edit a Mandap's financial records.

### 4.2 Mandap Super User

Every Mandap must have one initial super user.

Capabilities:

- Configure Mandap details.
- Create and manage festivals.
- Invite or remove committee members.
- Assign roles and permissions.
- Create and update poojas.
- Manage registrations and payment records.
- Add, approve, reject, or return expenses.
- View all Mandap reports.
- Configure public transparency settings.
- Correct or cancel transactions using auditable workflows.
- Transfer Mandap ownership.

### 4.3 Committee Member

Committee access should use granular permissions rather than one fixed role.

Possible permissions:

- View devotees.
- Create and update devotees.
- Manage pooja registrations.
- Create payments.
- Verify payments.
- Add expenses.
- Approve expenses.
- Manage sponsorships.
- View financial reports.
- Export reports.
- Send reminders.
- Manage announcements.
- Manage committee members.

Suggested role templates:

| Role | Suggested permissions |
|---|---|
| Treasurer | Payments, payment verification, expenses, approvals, and financial reports |
| Pooja Coordinator | Pooja setup, schedules, registrations, and participant lists |
| Sponsorship Coordinator | Sponsorship types, slots, bookings, and sponsor communication |
| Volunteer | Add devotees, create registrations, and record submitted payments |
| Auditor | Read-only access to payment, expense, and audit information |
| Committee Member | General read access with selected update permissions |

### 4.4 Devotee or Public User

Capabilities:

- View Mandap and festival details.
- Browse available poojas.
- Register individuals or family members.
- Sponsor prasadam or other configured items.
- Select a donation amount.
- Make an online or offline payment.
- Upload payment proof if enabled.
- Download receipts.
- View personal registrations and payment status.
- View the Mandap's published financial summary.

For the first version, devotees can authenticate using mobile number and OTP. Public browsing should not require login.

---

## 5. Mandap Registration and Onboarding

### Registration Fields

- Mandap name
- Organization or committee name
- Mandap type
- Primary contact name
- Mobile number
- Email
- Address
- City, state, and PIN code
- Preferred language
- Logo or image
- Public URL slug
- UPI ID, optional
- Bank details, optional and private
- Terms and privacy acceptance

### Registration Workflow

1. Organizer submits Mandap registration.
2. Mobile number or email is verified.
3. Platform creates the Mandap tenant.
4. Registrant becomes the initial super user.
5. Super user completes Mandap settings.
6. Super user creates the first festival.
7. Super user invites committee members.
8. Public Mandap page is published when ready.

---

## 6. Festival Configuration

Each Mandap can create multiple festivals.

### Festival Fields

- Festival name
- Description
- Start date
- End date
- Venue and address
- Contact information
- Banner or poster
- Default language
- Currency
- Time zone
- UPI/payment details
- Public registration URL
- Registration start and closing dates
- Registration approval requirement
- Offline payment availability
- Public financial report setting
- Public sponsor recognition setting
- Active, draft, completed, or archived status

### Example

```text
Festival: Navratri Celebrations 2027
Duration: Nine days
Standard daily pooja: ₹400 per person
Public financial visibility: Enabled
Payment methods: UPI, cash, and bank transfer
```

---

## 7. Custom Pooja Management

Poojas must be configurable by each Mandap. Saraswati Puja, Kumkum Puja, Chandi Homam, and other poojas must be created through configuration rather than hard-coded product logic.

### Pooja Fields

- Pooja name
- Description
- Festival
- Category
- Date or recurrence schedule
- Start time and end time
- Registration start and closing dates
- Price or suggested donation
- Pricing unit
- Eligibility description
- Minimum participants
- Maximum participants or capacity
- Maximum registrations per family
- Approval requirement
- Custom instructions
- Public or committee-only visibility
- Active or inactive status
- Optional image
- Custom fields

### Pooja Types

- One-time pooja
- Recurring daily pooja
- Multiple selected days
- Full-festival package
- Special-day pooja
- Homam
- Archana
- Free event
- Donation-only event

### Pricing Units

- Per person
- Per family
- Per child
- Per day
- Per selected day
- Full festival
- Fixed sponsor amount
- Suggested donation
- Free
- Custom amount

### Eligibility Options

- Everyone
- Children only
- Women only
- Men only
- Families
- Couples
- Age-range guidance
- Custom eligibility note

In the initial release, eligibility should be communicated clearly but should not require intrusive identity validation.

### Example Navratri Configuration

| Pooja | Type | Pricing | Eligibility |
|---|---|---:|---|
| Daily Pooja | Recurring for nine days | ₹400 per person per day | Everyone |
| Nine-Day Pooja Package | Festival package | ₹3,600 per person | Everyone |
| Saraswati Puja | Special-day pooja | Mandap-configured | Children |
| Kumkum Puja | Special-day pooja | Mandap-configured | Women |
| Daily Special Pooja | Daily configurable event | Mandap-configured | Custom |
| Chandi Homam | Special event | Fixed, per person, or per family | Custom |

### Daily Pooja Pricing Rules

The configuration must support:

- ₹400 for one selected day.
- ₹400 multiplied by the number of selected days.
- ₹3,600 for all nine days.
- A discounted full-festival package.
- Different rates for adults and children, if configured.
- Optional maximum amount per family.

---

## 8. Devotee and Family Management

### Devotee Fields

- Full name
- Mobile number
- Email, optional
- Address, optional
- Apartment or house number, optional
- Family name
- Preferred language
- Notification consent
- Notes visible only to authorized committee members
- Custom fields

### Family Member Fields

- Name
- Relationship
- Age group
- Optional eligibility information
- Selected poojas
- Custom fields

Avoid collecting exact dates of birth or other sensitive personal information unless genuinely necessary.

### Registration Workflow

1. Devotee opens the Mandap link or scans its QR code.
2. Devotee enters and verifies a mobile number.
3. Devotee creates or selects a family profile.
4. Devotee selects a pooja.
5. Devotee selects applicable date or dates.
6. Devotee selects participants.
7. Application calculates the payable or suggested amount.
8. Devotee reviews the registration.
9. Devotee selects a payment method.
10. Registration is submitted.
11. Confirmation is shown and sent.
12. Receipt is generated after payment confirmation.

Committee members must also be able to create registrations for people at an on-site help desk.

---

## 9. Prasadam and Other Sponsorships

The sponsorship module must be configurable and separate from pooja registration.

### Sponsorship Fields

- Sponsorship name
- Description
- Festival
- Date
- Time or meal type
- Number of available slots
- Full or partial sponsorship option
- Fixed, suggested, or custom amount
- Sponsor display name
- Public recognition preference
- Anonymous sponsorship option
- Payment status
- Booking status
- Instructions

### Example Sponsorship Types

- Morning prasadam
- Afternoon annadanam
- Evening prasadam
- Fruits
- Flowers
- Drinking water
- Decoration
- Cultural program
- Full-day sponsorship

### Sponsorship Workflow

1. Devotee views the sponsorship calendar.
2. Devotee selects an available date and category.
3. Devotee enters sponsor or family name.
4. Devotee chooses public recognition or anonymous sponsorship.
5. Devotee pays or makes a commitment.
6. The slot is reserved.
7. Committee verifies payment when required.
8. The sponsor is shown on the public schedule only when permitted.

The application must prevent accidental double-booking when only one slot is available.

---

## 10. Donations and Payments

Donation commitments and actual payments must be stored separately.

### Example

```text
Committed amount: ₹5,000
Amount paid: ₹3,000
Outstanding amount: ₹2,000
Status: Partially Paid
```

### Payment Statuses

- Not Paid
- Partially Paid
- Paid
- Submitted for Verification
- Failed
- Refunded
- Partially Refunded
- Waived
- Cancelled

### Payment Methods

- Cash
- UPI
- Bank transfer
- Debit or credit card
- Payment gateway
- Cheque
- Other

### Payment Features

- UPI QR code
- UPI intent link
- Transaction reference
- Payment screenshot upload
- Manual cash confirmation
- Partial payments
- Multiple payments against one registration or commitment
- Automatic receipt number
- Receipt download and sharing
- Refund and cancellation tracking
- Payment history
- Verification history
- Audit trail

A committee member must not overwrite a ₹3,000 payment with ₹5,000. A separate ₹2,000 transaction must be recorded so that the history remains accurate.

### Payment Reconciliation Rule

A payment should be marked as confirmed only when:

- A payment gateway sends a verified success webhook, or
- An authorized committee member verifies the offline payment.

Opening a UPI application must not mark a payment as successful.

---

## 11. Expense Tracker

Expenses must be visible to authorized committee members and optionally summarized for the public.

### Expense Fields

- Expense title
- Description
- Festival
- Category
- Date
- Amount
- Vendor
- Payment method
- Paid by
- Added by
- Approved or rejected by
- Bill or receipt attachment
- Approval status
- Visibility status
- Created and updated timestamps
- Audit history

### Suggested Expense Categories

- Idol or deity arrangements
- Tent and stage
- Decoration
- Flowers
- Pooja materials
- Priest charges
- Prasadam
- Annadanam
- Electricity
- Sound system
- Permissions
- Security
- Cleaning
- Transportation
- Printing
- Cultural programs
- Miscellaneous

Mandaps must be able to create their own categories.

### Expense Approval Workflow

1. Committee member creates an expense.
2. Committee member uploads the bill or receipt.
3. Expense receives `Pending Approval` status.
4. Treasurer or super user reviews it.
5. Reviewer approves, rejects, or requests correction.
6. Approved expense appears in financial calculations.
7. Every change remains available in the audit log.

### Expense Statuses

- Draft
- Pending Approval
- Approved
- Rejected
- Correction Requested
- Cancelled

### Financial Summary

```text
Total donations pledged: ₹5,00,000
Total amount collected: ₹4,25,000
Pending collections: ₹75,000
Approved expenses: ₹3,10,000
Pending expenses: ₹20,000
Available balance: ₹1,15,000
```

The application must distinguish actual cash available from unpaid commitments.

---

## 12. Financial Transparency

### Internal Committee View

Authorized committee members can view:

- Devotee-level payment information
- Contact details based on permission
- Pending collections
- Individual payment transactions
- Individual expenses
- Receipt and bill attachments
- Cash handled by each committee member
- Expense approval status
- Full audit history

### Public Transparency View

Public users can view only Mandap-approved summaries:

- Total amount collected
- Total approved expenditure
- Current balance
- Expense totals by category
- Major sponsorships when sponsor permission is available
- Date of last financial update

The public page must not expose:

- Mobile numbers
- Home addresses
- Individual payment status
- Private donor information
- Bank account information
- Unredacted receipts containing personal or financial information

---

## 13. Dashboards

### 13.1 Super User Dashboard

- Total registrations
- Today's poojas
- Total pledged
- Total collected
- Pending collection
- Total approved expenses
- Current available balance
- Pending expense approvals
- Available sponsorship slots
- Recent activity
- Important alerts

### 13.2 Treasurer Dashboard

- Cash collected
- Online payments
- Payments pending verification
- Partial payments
- Outstanding commitments
- Expenses awaiting approval
- Daily closing balance
- Committee-member-wise cash collection
- Reconciliation warnings

### 13.3 Pooja Coordinator Dashboard

- Today's poojas
- Participant count
- Remaining capacity
- Participant list
- Special instructions
- Registration approval queue
- Check-in status, if enabled

### 13.4 Public Dashboard

- Festival schedule
- Available poojas
- Available sponsorships
- Registration action
- Payment action
- Announcements
- Published financial summary

---

## 14. Main Application Screens

### Public and Devotee Screens

1. Mandap landing page
2. Festival details and schedule
3. Pooja list
4. Pooja details
5. Registration form
6. Family-member selection
7. Sponsorship calendar
8. Donation and payment page
9. Payment confirmation
10. My registrations
11. My payments
12. Receipt view
13. Public financial summary
14. Announcements

### Committee Screens

1. Dashboard
2. Devotees
3. Families
4. Registrations
5. Pooja configuration
6. Pooja schedule
7. Sponsorship calendar
8. Payments
9. Payment verification queue
10. Expenses
11. Expense approval queue
12. Committee members
13. Roles and permissions
14. Reports
15. Announcements
16. Mandap settings
17. Audit log

---

## 15. Recommended Technical Architecture

### Front End

Recommended technologies:

- Next.js
- React
- TypeScript
- Progressive Web App support
- Tailwind CSS, Fluent UI, or Material UI
- React Hook Form
- Zod for client and shared validation
- TanStack Query for server-state management

Why Next.js:

- Responsive web experience
- Good mobile performance
- Server-side rendering for public pages
- Search-friendly public Mandap pages
- Shared code for public and committee experiences
- Installable PWA capability

### Back End

#### Recommended Microsoft-Oriented Option

- ASP.NET Core Web API
- C#
- Entity Framework Core
- Background services or Azure Functions
- FluentValidation
- OpenAPI/Swagger

#### Alternative TypeScript Option

- Node.js
- NestJS
- TypeScript
- Prisma or TypeORM
- BullMQ for background jobs
- OpenAPI/Swagger

For an Azure-hosted production product, **Next.js + ASP.NET Core + PostgreSQL** is the recommended stack.

### Database and Storage

- PostgreSQL for core relational data
- Redis for OTPs, caching, rate limiting, and background jobs
- Azure Blob Storage for bills, receipts, banners, and payment evidence

### Azure Hosting

- Azure Static Web Apps or Azure App Service for the front end
- Azure App Service or Azure Container Apps for APIs
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Blob Storage
- Azure Communication Services or an approved SMS provider
- Azure Key Vault
- Application Insights
- Azure Front Door and Web Application Firewall when required

### High-Level Architecture

```text
Mobile/Desktop Browser
        |
        v
Next.js PWA
        |
        v
ASP.NET Core REST API
        |
        +--> PostgreSQL
        +--> Redis
        +--> Azure Blob Storage
        +--> Payment Gateway
        +--> SMS/Email/WhatsApp Provider
        +--> Background Jobs
        +--> Application Insights
```

---

## 16. Core Data Model

Every Mandap-owned record must include `mandap_id` directly or be linked securely to a Mandap-owned parent record.

### Tenant and Access Tables

- `mandaps`
- `mandap_settings`
- `users`
- `mandap_members`
- `roles`
- `permissions`
- `role_permissions`
- `member_permissions`
- `invitations`

### Festival Tables

- `festivals`
- `festival_days`
- `pooja_categories`
- `poojas`
- `pooja_schedules`
- `pooja_pricing_rules`
- `pooja_eligibility_rules`

### Devotee and Registration Tables

- `devotees`
- `families`
- `family_members`
- `pooja_registrations`
- `registration_participants`
- `registration_custom_values`

### Payment Tables

- `donation_commitments`
- `payment_orders`
- `payments`
- `payment_allocations`
- `payment_evidence`
- `refunds`
- `receipts`

### Sponsorship Tables

- `sponsorship_types`
- `sponsorship_slots`
- `sponsorship_bookings`

### Expense Tables

- `expense_categories`
- `expenses`
- `expense_attachments`
- `expense_approvals`

### Supporting Tables

- `announcements`
- `notifications`
- `notification_templates`
- `custom_field_definitions`
- `custom_field_values`
- `audit_logs`
- `activity_logs`

### Common Entity Fields

Most entities should contain:

```text
id
mandap_id
created_at
created_by
updated_at
updated_by
version
status
```

Use UUIDs or another non-sequential public identifier.

---

## 17. Custom-Field Framework

Mandaps should be able to add their own fields without requiring code changes.

Example custom fields:

- Gothram
- Nakshatram
- Sankalpam name
- Apartment number
- Child's class
- Prasadam preference
- T-shirt size
- Volunteer availability
- Additional family information

Supported field types:

- Single-line text
- Multi-line text
- Number
- Currency
- Date
- Date and time
- Dropdown
- Multi-select
- Checkbox
- Yes or no
- File upload

Custom fields can be attached to:

- Devotees
- Family members
- Poojas
- Registrations
- Sponsorships
- Expenses

Core financial fields, including amount, payer, transaction ID, payment status, and approval status, must remain standardized.

---

## 18. API Design

### API Groups

```text
/api/auth
/api/mandaps
/api/members
/api/roles
/api/festivals
/api/poojas
/api/registrations
/api/devotees
/api/families
/api/sponsorships
/api/donations
/api/payments
/api/expenses
/api/reports
/api/notifications
/api/announcements
/api/audit-logs
```

### Example Endpoints

```text
POST   /api/mandaps
GET    /api/mandaps/{mandapId}
PATCH  /api/mandaps/{mandapId}

POST   /api/mandaps/{mandapId}/members
PATCH  /api/mandaps/{mandapId}/members/{memberId}
DELETE /api/mandaps/{mandapId}/members/{memberId}

POST   /api/mandaps/{mandapId}/festivals
GET    /api/mandaps/{mandapId}/festivals
PATCH  /api/festivals/{festivalId}

POST   /api/festivals/{festivalId}/poojas
GET    /api/festivals/{festivalId}/poojas
PATCH  /api/poojas/{poojaId}

POST   /api/poojas/{poojaId}/registrations
GET    /api/festivals/{festivalId}/registrations
PATCH  /api/registrations/{registrationId}

POST   /api/festivals/{festivalId}/sponsorship-types
POST   /api/sponsorship-slots/{slotId}/bookings

POST   /api/registrations/{registrationId}/commitments
POST   /api/commitments/{commitmentId}/payments
PATCH  /api/payments/{paymentId}/verify
POST   /api/payments/{paymentId}/refunds

POST   /api/festivals/{festivalId}/expenses
PATCH  /api/expenses/{expenseId}
POST   /api/expenses/{expenseId}/approve
POST   /api/expenses/{expenseId}/reject

GET    /api/festivals/{festivalId}/finance-summary
GET    /api/festivals/{festivalId}/reports/pending-payments
GET    /api/festivals/{festivalId}/reports/expenses
```

### API Requirements

- Validate Mandap membership on every protected request.
- Validate permissions on the server.
- Never trust `mandap_id` sent by the client without verifying access.
- Use pagination for list APIs.
- Support filtering and sorting.
- Use idempotency keys for payment and transaction-creation APIs.
- Use optimistic concurrency for financial record updates.
- Record audit events for sensitive changes.
- Publish OpenAPI documentation.

---

## 19. Authentication and Security

### Authentication Options

- Mobile OTP for devotees
- Mobile OTP or email magic link for committee members
- Passwordless login
- Optional Microsoft or Google sign-in
- Multi-factor authentication for super users

### Authorization

- Tenant-scoped authorization
- Role-based access control
- Optional permission overrides
- Server-side authorization policies
- Read-only auditor role

### Security Requirements

- Strict tenant data isolation
- Encryption in transit and at rest
- Secure file upload validation
- Malware scanning for uploaded files where possible
- Rate limiting
- OTP attempt limiting
- Secure session management
- Payment webhook signature verification
- Secret storage in Azure Key Vault
- Daily database backups
- Point-in-time database recovery
- Audit logs for financial changes
- Session termination and member deactivation
- Soft deletion or cancellation for financial records
- Periodic access review
- Dependency and container vulnerability scanning
- Security headers and Content Security Policy

Financial records must not be permanently deleted. Use cancellation, reversal, adjustment, or refund entries while preserving history.

---

## 20. Payment Integration Plan

Potential India-focused providers:

- Razorpay
- Cashfree
- PayU
- Direct UPI intent
- Static Mandap UPI QR

### MVP Payment Plan

- Cash
- Static UPI QR
- Transaction reference
- Payment screenshot upload
- Committee verification
- Manual receipt generation after confirmation

### Version 2 Payment Plan

- Payment gateway checkout
- Automatic payment confirmation
- Signed webhook handling
- Automated receipts
- Refund processing
- Reconciliation reports

---

## 21. Notifications

### Notification Types

- Registration confirmation
- Payment submission confirmation
- Payment verification confirmation
- Pending-payment reminder
- Pooja reminder
- Sponsorship reminder
- Expense approval notification
- Expense rejection or correction request
- Festival announcement
- Receipt sharing

### Channels

- In-app
- SMS
- Email
- WhatsApp, subject to provider and template approval

### Example Reminder

> Namaste. Your registration for Chandi Homam on 8 October is confirmed. ₹1,001 remains pending. Please complete the payment using the Mandap payment link.

Mandaps should be able to customize templates and languages.

---

## 22. Reports and Exports

### Reports

- Daily collection report
- Pooja-wise registration report
- Devotee-wise payment report
- Pending payment report
- Payment-method report
- Sponsorship report
- Expense-category report
- Income-versus-expense report
- Committee-member-wise cash collection report
- End-of-festival financial statement
- Audit report

### Exports

- CSV
- Excel in a later release
- PDF statement
- Printable participant list
- Printable and downloadable receipt
- Committee financial summary

---

## 23. Mobile-First and PWA Requirements

Build the initial product as a Progressive Web App instead of separate Android and iOS applications.

Required capabilities:

- Install on home screen
- Responsive layouts
- Large touch targets
- Bottom navigation for frequent actions
- Camera access for bill and payment-proof uploads
- QR-code scanning where useful
- Fast registration forms
- Search devotees by mobile number
- Slow-network handling
- Draft form recovery
- Offline queue for selected committee actions in a later phase
- Mobile cards as alternatives to wide desktop tables

Suggested mobile navigation:

- Home
- Registrations
- Payments
- Expenses
- More

---

## 24. Accessibility Requirements

Target WCAG 2.2 AA where practical.

Requirements:

- Complete keyboard navigation
- Screen-reader names and descriptions
- Visible focus indicators
- Accessible form validation
- Error summary and inline errors
- Status announcements
- Sufficient color contrast
- Text resizing and zoom support
- Status represented with text and icons, not color alone
- Accessible data tables
- Mobile-friendly alternatives to wide tables
- Proper heading hierarchy
- Touch targets of sufficient size
- Reduced-motion support
- Captions or alternatives for media

---

## 25. MVP Scope

### Include in MVP

- Mandap registration
- One super user per Mandap
- Committee-member invitations
- Role and permission management
- Festival creation
- Custom pooja creation
- Recurring daily poojas
- Special-day poojas
- Per-person, per-family, per-day, package, fixed, and custom pricing
- Devotee and family registration
- Pooja registrations
- Prasadam sponsorship
- Donation commitments
- Cash and UPI payment tracking
- Paid, partially paid, pending, and verification statuses
- Receipt generation
- Expense tracking
- Expense approval
- Financial dashboard
- Public transparency page
- CSV export
- Mobile-responsive PWA
- Audit trail

### Move to Version 2

- Integrated payment gateway
- Automated WhatsApp notifications
- Full multi-language interface
- Offline committee operations
- Volunteer check-in
- Inventory management
- Accounting-system integration
- Multiple super users
- Advanced analytics
- Subscription billing
- Native Android and iOS applications

---

## 26. Development Phases

### Phase 1: Discovery and UX, 2 Weeks

Deliverables:

- Detailed requirements
- Roles and permission matrix
- Festival and pooja configuration rules
- User journeys
- Information architecture
- Mobile-first wireframes
- Database model
- API contract
- Security and privacy approach

Validate with:

- One Mandap organizer
- One treasurer
- Two committee members
- Three devotees

### Phase 2: Platform Foundation, 2 Weeks

Build:

- Authentication
- Mandap registration
- Tenant isolation
- User roles and permissions
- Committee invitations
- Mandap settings
- Audit framework
- Basic platform administration

### Phase 3: Pooja and Registration, 3 Weeks

Build:

- Festival creation
- Daily and special poojas
- Recurrence and pricing rules
- Eligibility information
- Devotee and family profiles
- Registration workflow
- Committee registration management

### Phase 4: Sponsorships and Payments, 3 Weeks

Build:

- Prasadam sponsorship calendar
- Sponsorship booking
- Donation commitments
- Partial payment tracking
- UPI and manual payments
- Verification workflow
- Receipts
- Payment reports

### Phase 5: Expenses and Transparency, 2 Weeks

Build:

- Expense creation
- Bill and receipt uploads
- Expense approval workflow
- Financial dashboard
- Public financial summary
- Income-versus-expense calculations

### Phase 6: Testing and Pilot, 2 Weeks

Perform:

- Functional testing
- Mobile and responsive testing
- Accessibility testing
- Security testing
- Tenant-isolation testing
- Payment-reconciliation testing
- Basic load testing
- Pilot Mandap onboarding

### Phase 7: Production Launch, 1 Week

Complete:

- Production deployment
- Monitoring and alerting
- Backup validation
- Admin documentation
- Committee user guide
- Support process
- Launch checklist

**Estimated MVP duration:** 14 to 15 weeks for a small, focused team.

---

## 27. Suggested Team

- 1 product owner or business analyst
- 1 UX/product designer
- 1 front-end engineer
- 1 back-end engineer
- 1 QA engineer
- Part-time DevOps and security support

A two-person engineering team can build an early pilot, but financial-data security, accessibility, and testing should not be skipped.

---

## 28. Testing Plan

### Functional Testing

- Daily pricing calculation
- Multiple participant pricing
- Selected-day pricing
- Nine-day package pricing
- Discount handling
- Partial payments
- Multiple payments against one commitment
- Refunds and cancellations
- Sponsorship slot availability
- Sponsorship double-booking prevention
- Expense approval
- Receipt numbering
- CSV export
- Public financial calculations

### Permission Testing

- Volunteer cannot approve expenses.
- Pooja coordinator cannot change financial reports without permission.
- Treasurer cannot remove or replace the super user without permission.
- Public user cannot view private donor information.
- Member of Mandap A cannot access Mandap B.
- Deactivated member cannot access protected data.
- Auditor cannot modify records.

### Mobile Testing

Test at common widths:

- 320 px
- 360 px
- 375 px
- 390 px
- 412 px
- Tablet portrait and landscape
- Desktop

Test on:

- Android Chrome
- iOS Safari
- Microsoft Edge
- Desktop Chrome

### Security Testing

- Tenant-boundary tests
- Broken access-control tests
- File-upload tests
- Rate-limiting tests
- OTP abuse tests
- Session-expiry tests
- Webhook signature tests
- SQL injection tests
- Cross-site scripting tests
- CSRF protection where applicable
- Sensitive-data exposure tests

### Financial Testing

- Commitment total versus payment total
- Payment allocation
- Partial payment balance
- Refund calculations
- Approved versus pending expenses
- Available-balance calculation
- Duplicate payment prevention
- Concurrent payment verification
- Audit history completeness

---

## 29. Success Metrics

- Number of Mandaps registered
- Number of active festivals
- Devotee registration completion rate
- Number of pooja registrations
- Sponsorship occupancy rate
- Percentage of committed amount collected
- Reduction in pending payments
- Average expense approval time
- Number of active committee users
- Mobile-versus-desktop usage
- Failed-payment rate
- Reconciliation differences
- Support requests per Mandap
- Committee satisfaction
- Devotee satisfaction

---

## 30. Recommended First Pilot

Pilot with one Navratri Mandap using:

- One nine-day festival
- ₹400 daily pooja
- Nine-day package
- Saraswati Puja
- Kumkum Puja
- Chandi Homam
- Daily special pooja
- Daily prasadam sponsorships
- Five committee members
- Manual UPI verification
- Expense visibility for committee members
- Public summarized finance page

Do not start the pilot with a payment gateway. First validate registration, sponsorship, payment verification, receipts, expenses, reporting, and reconciliation. Add automated payments after the operating model is proven.

---

## 31. Suggested Initial Backlog

### Epic 1: Mandap Onboarding

- Register Mandap
- Verify super-user contact
- Configure Mandap profile
- Create public Mandap URL
- Upload logo and banner

### Epic 2: Authentication and Authorization

- Devotee OTP login
- Committee login
- Invite committee members
- Create role templates
- Assign permissions
- Deactivate member access

### Epic 3: Festival Management

- Create festival
- Configure dates and venue
- Publish or unpublish festival
- Archive completed festival
- Configure payment and transparency settings

### Epic 4: Pooja Configuration

- Create one-time pooja
- Create recurring daily pooja
- Configure pricing unit
- Configure package pricing
- Add eligibility information
- Configure capacity
- Configure registration dates

### Epic 5: Devotees and Registrations

- Create devotee profile
- Add family members
- Select pooja and dates
- Calculate amount
- Submit registration
- Approve registration when required
- View participant list

### Epic 6: Sponsorships

- Create sponsorship type
- Generate dated sponsor slots
- Display sponsorship calendar
- Book sponsorship slot
- Prevent double-booking
- Control public sponsor recognition

### Epic 7: Donations and Payments

- Create donation commitment
- Record cash payment
- Submit UPI payment reference
- Upload payment proof
- Verify payment
- Record partial payments
- Generate receipt
- Record refund or cancellation

### Epic 8: Expense Management

- Create expense category
- Add expense
- Upload receipt
- Submit expense for approval
- Approve or reject expense
- Display expense reports
- Publish approved summaries

### Epic 9: Dashboards and Reports

- Super-user dashboard
- Treasurer dashboard
- Pooja coordinator dashboard
- Public financial dashboard
- Pending-payment report
- Income-versus-expense report
- CSV export

### Epic 10: Auditing and Operations

- Record financial audit events
- Record permission changes
- Add monitoring
- Configure backups
- Add operational alerts
- Create support documentation

---

## 32. Definition of Done

A feature is complete when:

- Product requirements are met.
- UX supports mobile and desktop.
- Server-side permission checks are implemented.
- Tenant isolation is verified.
- Input validation and error handling are included.
- Audit logging is included for sensitive changes.
- Automated tests cover critical logic.
- Basic accessibility checks pass.
- Telemetry and operational logging are present.
- Documentation is updated.
- Product owner accepts the feature.

---

## 33. Final Recommendation

Build the application as a configurable, multi-tenant PWA rather than a one-off Navratri application.

The most important architecture requirements are:

1. Mandap-level data isolation.
2. Configurable poojas and sponsorships.
3. Flexible pricing and eligibility.
4. Separate commitments and actual payments.
5. Transparent, approval-based expense tracking.
6. Fine-grained committee permissions.
7. Complete financial audit history.
8. Mobile-first registration and administration.
9. Privacy-safe public reporting.
10. Reusable support for multiple festivals and future years.

This structure supports Navratri today while remaining reusable for Ganesh Chaturthi, Durga Puja, temples, apartment associations, and other community events.
