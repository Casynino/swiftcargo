-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'CUSTOMER_SUPPORT', 'CHINA_WAREHOUSE', 'DAR_WAREHOUSE', 'FINANCE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('MANAGEMENT', 'CUSTOMER_SUPPORT', 'CHINA_WAREHOUSE', 'DAR_WAREHOUSE', 'FINANCE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('CHINA', 'TANZANIA');

-- CreateEnum
CREATE TYPE "CargoStatus" AS ENUM ('REGISTERED', 'RECEIVED_CHINA', 'ASSIGNED_TO_CONTAINER', 'CONTAINER_LOADED', 'DEPARTED_CHINA', 'IN_TRANSIT', 'ARRIVED_TANZANIA', 'RECEIVED_DAR', 'READY_FOR_RELEASE', 'COLLECTED', 'DELIVERED', 'MISSING_AT_DAR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('LCL', 'FCL');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('CARTON', 'BALE', 'BAG', 'PALLET', 'CRATE', 'DRUM', 'PIECE', 'OTHER');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('CM', 'M');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('PACKAGE', 'SHIPPING_MARK', 'LABEL', 'CONDITION', 'DAMAGE', 'RECEIVING_EVIDENCE', 'RELEASE_EVIDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "CargoCondition" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'DAMAGED', 'WET', 'REPACKED');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('OPEN', 'LOADING', 'LOADED', 'SEALED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('GP_20', 'GP_40', 'HQ_40', 'HQ_45', 'LCL_CONSOLIDATED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'READY', 'DEPARTED_CHINA', 'IN_TRANSIT', 'ARRIVED_TANZANIA', 'CLEARANCE', 'CLEARED', 'DAR_WAREHOUSE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('BILL_OF_LADING', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'CUSTOMS_ENTRY', 'ARRIVAL_NOTICE', 'DELIVERY_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('PER_CBM', 'PER_KG', 'FLAT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ExpenseScope" AS ENUM ('CONTAINER', 'OFFICE', 'SPECIAL', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReleaseMethod" AS ENUM ('COLLECTION', 'DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('MISSING_CARGO', 'DAMAGED_CARGO', 'PACKAGE_MISMATCH', 'WEIGHT_DIFFERENCE', 'CBM_DIFFERENCE', 'WRONG_CUSTOMER', 'WRONG_CONTAINER', 'UNIDENTIFIED_CARGO', 'CUSTOMS_HOLD', 'SHIPMENT_DELAY', 'PAYMENT_DISCREPANCY', 'CUSTOMER_COMPLAINT', 'DELIVERY_FAILURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'WAITING_CUSTOMER', 'WAITING_FINANCE', 'WAITING_WAREHOUSE', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExceptionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('FULL_CONTAINER', 'SHARED_CARGO');

-- CreateEnum
CREATE TYPE "SourcingStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'SUPPLIER_FOUND', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('BANK', 'MOBILE_MONEY', 'CASH');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('PENDING', 'QUERIED', 'MISMATCH', 'SENT_BACK', 'UNDER_REVIEW', 'RECONCILED');

-- CreateEnum
CREATE TYPE "PickupNoteStatus" AS ENUM ('ACTIVE', 'USED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "department" "Department",
    "warehouseId" TEXT,
    "customerId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "baseSalary" DECIMAL(14,2),
    "lastLoginAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Tanzania',
    "shippingMark" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "wechat" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WarehouseKind" NOT NULL,
    "addressLocal" TEXT,
    "addressEnglish" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "shippingMark" TEXT,
    "paperReceiptNo" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "estimatedCurrency" TEXT,
    "estimatedAt" TIMESTAMP(3),
    "valuationSnapshot" JSONB,
    "supplierId" TEXT,
    "supplierRef" TEXT,
    "service" "ServiceType" NOT NULL DEFAULT 'LCL',
    "description" TEXT NOT NULL,
    "commodity" TEXT,
    "status" "CargoStatus" NOT NULL DEFAULT 'REGISTERED',
    "declaredPackages" INTEGER,
    "declaredCbm" DECIMAL(12,4),
    "operationalHold" BOOLEAN NOT NULL DEFAULT false,
    "operationalHoldReason" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoPackage" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "packageType" "PackageType" NOT NULL DEFAULT 'CARTON',
    "description" TEXT,
    "descriptionZh" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pieces" INTEGER,
    "unit" "MeasurementUnit" NOT NULL DEFAULT 'CM',
    "length" DECIMAL(10,2),
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "cbm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "cbmOverridden" BOOLEAN NOT NULL DEFAULT false,
    "weightKg" DECIMAL(12,3),
    "qrToken" TEXT NOT NULL,
    "balerNumber" TEXT,
    "paperReceiptNo" TEXT,
    "cargoType" TEXT,
    "containerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CargoPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoPhoto" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL DEFAULT 'PACKAGE',
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warehouseKind" "WarehouseKind",
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoStatusHistory" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "from" "CargoStatus",
    "to" "CargoStatus" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChinaReceiving" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "packagesCount" INTEGER NOT NULL,
    "piecesCount" INTEGER,
    "weightKg" DECIMAL(12,3),
    "cbm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "condition" "CargoCondition" NOT NULL DEFAULT 'GOOD',
    "location" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChinaReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DarReceiving" (
    "id" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "containerId" TEXT,
    "packagesCount" INTEGER NOT NULL,
    "piecesCount" INTEGER,
    "weightKg" DECIMAL(12,3),
    "cbm" DECIMAL(12,4),
    "condition" "CargoCondition" NOT NULL DEFAULT 'GOOD',
    "discrepancy" BOOLEAN NOT NULL DEFAULT false,
    "discrepancyNotes" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DarReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "snapshot" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "containerNumber" TEXT,
    "type" "ContainerType" NOT NULL DEFAULT 'HQ_40',
    "originWarehouseId" TEXT,
    "originPort" TEXT DEFAULT 'Guangzhou',
    "destinationPort" TEXT DEFAULT 'Dar es Salaam',
    "status" "ContainerStatus" NOT NULL DEFAULT 'OPEN',
    "sealNumber" TEXT,
    "sealedAt" TIMESTAMP(3),
    "loadingStartedAt" TIMESTAMP(3),
    "loadedAt" TIMESTAMP(3),
    "cargoDeadline" TIMESTAMP(3),
    "capacityCbm" DECIMAL(12,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerCargo" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "packagesCount" INTEGER NOT NULL DEFAULT 0,
    "weightKg" DECIMAL(12,3),
    "cbm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "standardRate" DECIMAL(12,4),
    "appliedRate" DECIMAL(12,4),
    "rateBasis" "RateBasis",
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "loadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerCargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "shippingLine" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "billOfLading" TEXT,
    "originPort" TEXT,
    "destinationPort" TEXT,
    "departureDate" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentDocument" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerEvent" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "from" "ContainerStatus",
    "to" "ContainerStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'China',
    "destination" TEXT NOT NULL DEFAULT 'Tanzania',
    "service" "ServiceType" NOT NULL,
    "cargoType" TEXT,
    "basis" "RateBasis" NOT NULL DEFAULT 'PER_CBM',
    "rate" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minimumCbm" DECIMAL(12,4),
    "minimumKg" DECIMAL(12,3),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRate" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shippingRateId" TEXT,
    "service" "ServiceType" NOT NULL,
    "cargoType" TEXT,
    "basis" "RateBasis" NOT NULL DEFAULT 'PER_CBM',
    "rate" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'USD',
    "quote" TEXT NOT NULL DEFAULT 'TZS',
    "rate" DECIMAL(14,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "setById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "containerCargoId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "billableCbm" DECIMAL(12,4),
    "billableKg" DECIMAL(12,3),
    "standardRate" DECIMAL(12,4),
    "appliedRate" DECIMAL(12,4),
    "rateBasis" "RateBasis",
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRateId" TEXT,
    "fxRate" DECIMAL(14,6),
    "totalTzs" DECIMAL(16,2),
    "paymentSnapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paperReceiptNo" TEXT,
    "packages" INTEGER,
    "pieces" INTEGER,
    "category" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "accountId" TEXT,
    "deliveryAdded" DECIMAL(14,2),
    "deliverySettledFrom" TEXT,
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRateId" TEXT,
    "fxRate" DECIMAL(14,6),
    "creditedAmount" DECIMAL(14,2),
    "baseCurrencyAmount" DECIMAL(16,0),
    "idempotencyKey" TEXT,
    "overpaymentReason" TEXT,
    "clearShortfallTzs" DECIMAL(16,0),
    "writtenOff" BOOLEAN NOT NULL DEFAULT false,
    "writeOffOfId" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "transactionRef" TEXT,
    "payerName" TEXT,
    "payerAccount" TEXT,
    "payerBank" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "submittedByCustomer" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerExpense" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "scope" "ExpenseScope" NOT NULL DEFAULT 'CONTAINER',
    "containerId" TEXT,
    "expenseTypeId" TEXT,
    "vendorId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "expenseDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "billedCustomerId" TEXT,
    "billedAmount" DECIMAL(14,2),
    "accountId" TEXT,
    "referenceNumber" TEXT,
    "description" TEXT,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContainerExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "accountId" TEXT,
    "expenseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "method" "ReleaseMethod" NOT NULL,
    "packagesReleased" INTEGER NOT NULL,
    "collectedByName" TEXT,
    "collectedByPhone" TEXT,
    "collectedByIdNo" TEXT,
    "relationship" TEXT,
    "signatureUrl" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "preferredDate" TIMESTAMP(3),
    "notes" TEXT,
    "charge" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'REQUESTED',
    "driverName" TEXT,
    "driverPhone" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionCase" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ExceptionPriority" NOT NULL DEFAULT 'NORMAL',
    "cargoId" TEXT,
    "customerId" TEXT,
    "containerId" TEXT,
    "department" "Department",
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "raisedById" TEXT,
    "assignedToId" TEXT,
    "resolution" TEXT,
    "managerNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "from" "ExceptionStatus",
    "to" "ExceptionStatus",
    "note" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cargoId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffUnread" BOOLEAN NOT NULL DEFAULT true,
    "customerUnread" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cargoId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "body" TEXT NOT NULL,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerBooking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "pickupAddress" TEXT,
    "destination" TEXT,
    "commodity" TEXT,
    "containerType" "ContainerType",
    "dangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "packages" INTEGER,
    "quantity" INTEGER,
    "dimensions" TEXT,
    "estimatedWeightKg" DECIMAL(12,3),
    "estimatedCbm" DECIMAL(12,4),
    "preferredShipment" TEXT,
    "requirements" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "staffNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT,
    "pickupLocation" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "cargoDescription" TEXT,
    "packages" INTEGER,
    "commodity" TEXT,
    "preferredDate" TIMESTAMP(3),
    "preferredTime" TEXT,
    "notes" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "staffNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "service" "ServiceType" NOT NULL DEFAULT 'LCL',
    "commodity" TEXT,
    "originCity" TEXT,
    "destination" TEXT,
    "estimatedCbm" DECIMAL(12,4),
    "estimatedWeightKg" DECIMAL(12,3),
    "hazardous" BOOLEAN NOT NULL DEFAULT false,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "quotedAmount" DECIMAL(14,2),
    "quotedCurrency" TEXT NOT NULL DEFAULT 'USD',
    "quotedAt" TIMESTAMP(3),
    "quoteExpiresAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentSchedule" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'Guangzhou',
    "destination" TEXT NOT NULL DEFAULT 'Dar es Salaam',
    "cargoDeadline" TIMESTAMP(3) NOT NULL,
    "closingDate" TIMESTAMP(3),
    "departureDate" TIMESTAMP(3) NOT NULL,
    "estimatedArrival" TIMESTAMP(3) NOT NULL,
    "vessel" TEXT,
    "voyage" TEXT,
    "shippingLine" TEXT,
    "containerId" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "product" TEXT NOT NULL,
    "details" TEXT,
    "quantity" TEXT,
    "budget" TEXT,
    "market" TEXT,
    "status" "SourcingStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "createdById" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketInformation" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT DEFAULT 'Guangzhou',
    "category" TEXT,
    "summary" TEXT,
    "body" TEXT,
    "imageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketInformation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldChange" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branch" TEXT,
    "kind" "AccountKind" NOT NULL DEFAULT 'BANK',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingBalanceAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountTransfer" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountArrived" DECIMAL(14,2) NOT NULL,
    "purpose" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "counted" DECIMAL(14,2) NOT NULL,
    "expected" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReview" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "verdict" "ReviewState" NOT NULL,
    "actualAmount" DECIMAL(14,2),
    "currency" TEXT,
    "note" TEXT,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupNote" (
    "id" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "cargoId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountTzs" DECIMAL(16,2),
    "qrToken" TEXT NOT NULL,
    "status" "PickupNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "onCredit" BOOLEAN NOT NULL DEFAULT false,
    "creditReason" TEXT,
    "creditDueAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "PickupNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT 'Swift Cargo',
    "tagline" TEXT DEFAULT 'On time, Every time',
    "email" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "whatsapp" TEXT,
    "darAddress" TEXT,
    "chinaAddress" TEXT,
    "chinaEntity" TEXT,
    "darEntity" TEXT,
    "darPostal" TEXT,
    "tin" TEXT,
    "vrn" TEXT,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "freeStorageDays" INTEGER NOT NULL DEFAULT 7,
    "storagePerDay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "storageCurrency" TEXT NOT NULL DEFAULT 'USD',
    "invoiceTerms" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- CreateIndex
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shippingMark_key" ON "Customer"("shippingMark");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_reference_key" ON "Cargo"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_qrToken_key" ON "Cargo"("qrToken");

-- CreateIndex
CREATE INDEX "Cargo_status_idx" ON "Cargo"("status");

-- CreateIndex
CREATE INDEX "Cargo_senderId_idx" ON "Cargo"("senderId");

-- CreateIndex
CREATE INDEX "Cargo_receiverId_idx" ON "Cargo"("receiverId");

-- CreateIndex
CREATE INDEX "Cargo_shippingMark_idx" ON "Cargo"("shippingMark");

-- CreateIndex
CREATE INDEX "Cargo_createdAt_idx" ON "Cargo"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CargoPackage_reference_key" ON "CargoPackage"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "CargoPackage_qrToken_key" ON "CargoPackage"("qrToken");

-- CreateIndex
CREATE INDEX "CargoPackage_cargoId_idx" ON "CargoPackage"("cargoId");

-- CreateIndex
CREATE INDEX "CargoPackage_containerId_idx" ON "CargoPackage"("containerId");

-- CreateIndex
CREATE INDEX "CargoPackage_paperReceiptNo_idx" ON "CargoPackage"("paperReceiptNo");

-- CreateIndex
CREATE INDEX "CargoPhoto_cargoId_kind_idx" ON "CargoPhoto"("cargoId", "kind");

-- CreateIndex
CREATE INDEX "CargoStatusHistory_cargoId_createdAt_idx" ON "CargoStatusHistory"("cargoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChinaReceiving_cargoId_key" ON "ChinaReceiving"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "DarReceiving_cargoId_key" ON "DarReceiving"("cargoId");

-- CreateIndex
CREATE INDEX "DarReceiving_containerId_idx" ON "DarReceiving"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_number_key" ON "DeliveryNote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_cargoId_key" ON "DeliveryNote"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_reference_key" ON "Container"("reference");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "Container_containerNumber_idx" ON "Container"("containerNumber");

-- CreateIndex
CREATE INDEX "ContainerCargo_cargoId_idx" ON "ContainerCargo"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerCargo_containerId_cargoId_key" ON "ContainerCargo"("containerId", "cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_number_key" ON "PackingList"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_containerId_key" ON "PackingList"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_containerId_key" ON "Shipment"("containerId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_eta_idx" ON "Shipment"("eta");

-- CreateIndex
CREATE INDEX "ShipmentDocument_shipmentId_idx" ON "ShipmentDocument"("shipmentId");

-- CreateIndex
CREATE INDEX "ContainerEvent_containerId_createdAt_idx" ON "ContainerEvent"("containerId", "createdAt");

-- CreateIndex
CREATE INDEX "ShippingRate_service_active_effectiveFrom_idx" ON "ShippingRate"("service", "active", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CustomerRate_customerId_active_idx" ON "CustomerRate"("customerId", "active");

-- CreateIndex
CREATE INDEX "ExchangeRate_base_quote_effectiveFrom_idx" ON "ExchangeRate"("base", "quote", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_containerCargoId_key" ON "Invoice"("containerCargoId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_dueAt_idx" ON "Invoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_cargoId_idx" ON "Invoice"("cargoId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentProof_paymentId_idx" ON "PaymentProof"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_customerId_idx" ON "Receipt"("customerId");

-- CreateIndex
CREATE INDEX "Receipt_invoiceId_idx" ON "Receipt"("invoiceId");

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseType_name_key" ON "ExpenseType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerExpense_reference_key" ON "ContainerExpense"("reference");

-- CreateIndex
CREATE INDEX "ContainerExpense_containerId_idx" ON "ContainerExpense"("containerId");

-- CreateIndex
CREATE INDEX "ContainerExpense_status_idx" ON "ContainerExpense"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_code_key" ON "PayrollRun"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_expenseId_key" ON "PayrollRun"("expenseId");

-- CreateIndex
CREATE INDEX "PayrollRun_status_idx" ON "PayrollRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");

-- CreateIndex
CREATE INDEX "PayrollItem_runId_idx" ON "PayrollItem"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_runId_userId_key" ON "PayrollItem"("runId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Release_number_key" ON "Release"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Release_cargoId_key" ON "Release"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRequest_reference_key" ON "DeliveryRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRequest_cargoId_key" ON "DeliveryRequest"("cargoId");

-- CreateIndex
CREATE INDEX "DeliveryRequest_status_idx" ON "DeliveryRequest"("status");

-- CreateIndex
CREATE INDEX "DeliveryRequest_customerId_idx" ON "DeliveryRequest"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionCase_reference_key" ON "ExceptionCase"("reference");

-- CreateIndex
CREATE INDEX "ExceptionCase_status_priority_idx" ON "ExceptionCase"("status", "priority");

-- CreateIndex
CREATE INDEX "ExceptionCase_cargoId_idx" ON "ExceptionCase"("cargoId");

-- CreateIndex
CREATE INDEX "ExceptionCase_department_status_idx" ON "ExceptionCase"("department", "status");

-- CreateIndex
CREATE INDEX "ExceptionEvent_caseId_createdAt_idx" ON "ExceptionEvent"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_reference_key" ON "Conversation"("reference");

-- CreateIndex
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_createdAt_idx" ON "CustomerContact"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerContact_cargoId_idx" ON "CustomerContact"("cargoId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_customerId_readAt_idx" ON "Notification"("customerId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerBooking_reference_key" ON "ContainerBooking"("reference");

-- CreateIndex
CREATE INDEX "ContainerBooking_status_createdAt_idx" ON "ContainerBooking"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PickupRequest_reference_key" ON "PickupRequest"("reference");

-- CreateIndex
CREATE INDEX "PickupRequest_status_createdAt_idx" ON "PickupRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_reference_key" ON "QuoteRequest"("reference");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentSchedule_published_departureDate_idx" ON "ShipmentSchedule"("published", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingRequest_reference_key" ON "SourcingRequest"("reference");

-- CreateIndex
CREATE INDEX "SourcingRequest_status_createdAt_idx" ON "SourcingRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketInformation_slug_key" ON "MarketInformation"("slug");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "FieldChange_entity_entityId_createdAt_idx" ON "FieldChange"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_active_sortOrder_idx" ON "BankAccount"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransfer_reference_key" ON "AccountTransfer"("reference");

-- CreateIndex
CREATE INDEX "AccountTransfer_fromAccountId_idx" ON "AccountTransfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "AccountTransfer_toAccountId_idx" ON "AccountTransfer"("toAccountId");

-- CreateIndex
CREATE INDEX "AccountTransfer_transferDate_idx" ON "AccountTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "CashCount_accountId_countedAt_idx" ON "CashCount"("accountId", "countedAt");

-- CreateIndex
CREATE INDEX "ManagerReview_entity_entityId_createdAt_idx" ON "ManagerReview"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerReview_verdict_idx" ON "ManagerReview"("verdict");

-- CreateIndex
CREATE UNIQUE INDEX "PickupNote_noteNumber_key" ON "PickupNote"("noteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PickupNote_cargoId_key" ON "PickupNote"("cargoId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupNote_qrToken_key" ON "PickupNote"("qrToken");

-- CreateIndex
CREATE INDEX "PickupNote_status_issuedAt_idx" ON "PickupNote"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "PickupNote_customerId_idx" ON "PickupNote"("customerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPackage" ADD CONSTRAINT "CargoPackage_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPackage" ADD CONSTRAINT "CargoPackage_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPhoto" ADD CONSTRAINT "CargoPhoto_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPhoto" ADD CONSTRAINT "CargoPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoStatusHistory" ADD CONSTRAINT "CargoStatusHistory_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoStatusHistory" ADD CONSTRAINT "CargoStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceiving" ADD CONSTRAINT "ChinaReceiving_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceiving" ADD CONSTRAINT "ChinaReceiving_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceiving" ADD CONSTRAINT "ChinaReceiving_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarReceiving" ADD CONSTRAINT "DarReceiving_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarReceiving" ADD CONSTRAINT "DarReceiving_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarReceiving" ADD CONSTRAINT "DarReceiving_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarReceiving" ADD CONSTRAINT "DarReceiving_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerCargo" ADD CONSTRAINT "ContainerCargo_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerCargo" ADD CONSTRAINT "ContainerCargo_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRate" ADD CONSTRAINT "CustomerRate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRate" ADD CONSTRAINT "CustomerRate_shippingRateId_fkey" FOREIGN KEY ("shippingRateId") REFERENCES "ShippingRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_billedCustomerId_fkey" FOREIGN KEY ("billedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ContainerExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionCase" ADD CONSTRAINT "ExceptionCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionEvent" ADD CONSTRAINT "ExceptionEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ExceptionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionEvent" ADD CONSTRAINT "ExceptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerBooking" ADD CONSTRAINT "ContainerBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRequest" ADD CONSTRAINT "SourcingRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRequest" ADD CONSTRAINT "SourcingRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRequest" ADD CONSTRAINT "SourcingRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldChange" ADD CONSTRAINT "FieldChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupNote" ADD CONSTRAINT "PickupNote_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupNote" ADD CONSTRAINT "PickupNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupNote" ADD CONSTRAINT "PickupNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
