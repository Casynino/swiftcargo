-- DropForeignKey
ALTER TABLE "CargoPackage" DROP CONSTRAINT "CargoPackage_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "CargoPhoto" DROP CONSTRAINT "CargoPhoto_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "CargoStatusHistory" DROP CONSTRAINT "CargoStatusHistory_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "CashCount" DROP CONSTRAINT "CashCount_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ChinaReceiving" DROP CONSTRAINT "ChinaReceiving_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "ContainerCargo" DROP CONSTRAINT "ContainerCargo_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "ContainerCargo" DROP CONSTRAINT "ContainerCargo_containerId_fkey";

-- DropForeignKey
ALTER TABLE "ContainerEvent" DROP CONSTRAINT "ContainerEvent_containerId_fkey";

-- DropForeignKey
ALTER TABLE "ContainerExpense" DROP CONSTRAINT "ContainerExpense_containerId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerContact" DROP CONSTRAINT "CustomerContact_customerId_fkey";

-- DropForeignKey
ALTER TABLE "DarReceiving" DROP CONSTRAINT "DarReceiving_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryNote" DROP CONSTRAINT "DeliveryNote_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryRequest" DROP CONSTRAINT "DeliveryRequest_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "ExceptionEvent" DROP CONSTRAINT "ExceptionEvent_caseId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "PackingList" DROP CONSTRAINT "PackingList_containerId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentProof" DROP CONSTRAINT "PaymentProof_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "PickupNote" DROP CONSTRAINT "PickupNote_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "Release" DROP CONSTRAINT "Release_cargoId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_containerId_fkey";

-- DropForeignKey
ALTER TABLE "ShipmentDocument" DROP CONSTRAINT "ShipmentDocument_shipmentId_fkey";

-- DropIndex
DROP INDEX "AuditLog_entity_entityId_idx";

-- DropIndex
DROP INDEX "Cargo_receiverId_idx";

-- DropIndex
DROP INDEX "Cargo_senderId_idx";

-- DropIndex
DROP INDEX "Cargo_status_idx";

-- DropIndex
DROP INDEX "CargoPackage_cargoId_idx";

-- DropIndex
DROP INDEX "Container_status_idx";

-- DropIndex
DROP INDEX "ContainerCargo_cargoId_idx";

-- DropIndex
DROP INDEX "Conversation_customerId_idx";

-- DropIndex
DROP INDEX "CustomerContact_cargoId_idx";

-- DropIndex
DROP INDEX "Invoice_cargoId_idx";

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_action_createdAt_idx" ON "AuditLog"("entity", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Cargo_status_deletedAt_idx" ON "Cargo"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Cargo_senderId_createdAt_idx" ON "Cargo"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Cargo_receiverId_createdAt_idx" ON "Cargo"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "Cargo_deletedAt_idx" ON "Cargo"("deletedAt");

-- CreateIndex
CREATE INDEX "CargoPackage_cargoId_deletedAt_idx" ON "CargoPackage"("cargoId", "deletedAt");

-- CreateIndex
CREATE INDEX "CargoPackage_cargoType_idx" ON "CargoPackage"("cargoType");

-- CreateIndex
CREATE INDEX "ChinaReceiving_receivedAt_idx" ON "ChinaReceiving"("receivedAt");

-- CreateIndex
CREATE INDEX "Container_status_deletedAt_idx" ON "Container"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "ContainerBooking_customerId_idx" ON "ContainerBooking"("customerId");

-- CreateIndex
CREATE INDEX "ContainerCargo_cargoId_createdAt_idx" ON "ContainerCargo"("cargoId", "createdAt");

-- CreateIndex
CREATE INDEX "ContainerCargo_createdAt_idx" ON "ContainerCargo"("createdAt");

-- CreateIndex
CREATE INDEX "ContainerEvent_actorId_containerId_idx" ON "ContainerEvent"("actorId", "containerId");

-- CreateIndex
CREATE INDEX "ContainerExpense_accountId_paidDate_idx" ON "ContainerExpense"("accountId", "paidDate");

-- CreateIndex
CREATE INDEX "ContainerExpense_deletedAt_createdAt_idx" ON "ContainerExpense"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ContainerExpense_expenseDate_idx" ON "ContainerExpense"("expenseDate");

-- CreateIndex
CREATE INDEX "ContainerExpense_billedCustomerId_idx" ON "ContainerExpense"("billedCustomerId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_lastMessageAt_idx" ON "Conversation"("customerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_createdAt_idx" ON "Customer"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerContact_cargoId_createdAt_idx" ON "CustomerContact"("cargoId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerContact_invoiceId_idx" ON "CustomerContact"("invoiceId");

-- CreateIndex
CREATE INDEX "CustomerContact_createdAt_idx" ON "CustomerContact"("createdAt");

-- CreateIndex
CREATE INDEX "DarReceiving_receivedAt_idx" ON "DarReceiving"("receivedAt");

-- CreateIndex
CREATE INDEX "DarReceiving_discrepancy_verified_idx" ON "DarReceiving"("discrepancy", "verified");

-- CreateIndex
CREATE INDEX "ExceptionCase_status_createdAt_idx" ON "ExceptionCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExceptionCase_assignedToId_status_idx" ON "ExceptionCase"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ExceptionCase_customerId_idx" ON "ExceptionCase"("customerId");

-- CreateIndex
CREATE INDEX "ExceptionCase_containerId_idx" ON "ExceptionCase"("containerId");

-- CreateIndex
CREATE INDEX "Invoice_cargoId_status_idx" ON "Invoice"("cargoId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_issuedAt_idx" ON "Invoice"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_customerId_createdAt_idx" ON "Notification"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_writtenOff_accountId_idx" ON "Payment"("status", "writtenOff", "accountId");

-- CreateIndex
CREATE INDEX "Payment_accountId_paidAt_idx" ON "Payment"("accountId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_status_verifiedAt_idx" ON "Payment"("status", "verifiedAt");

-- CreateIndex
CREATE INDEX "Payment_writeOffOfId_idx" ON "Payment"("writeOffOfId");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE INDEX "PayrollItem_userId_idx" ON "PayrollItem"("userId");

-- CreateIndex
CREATE INDEX "PickupNote_onCredit_status_issuedAt_idx" ON "PickupNote"("onCredit", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "PickupRequest_customerId_idx" ON "PickupRequest"("customerId");

-- CreateIndex
CREATE INDEX "QuoteRequest_customerId_idx" ON "QuoteRequest"("customerId");

-- CreateIndex
CREATE INDEX "Receipt_issuedAt_idx" ON "Receipt"("issuedAt");

-- CreateIndex
CREATE INDEX "Release_releasedAt_idx" ON "Release"("releasedAt");

-- CreateIndex
CREATE INDEX "SourcingRequest_customerId_idx" ON "SourcingRequest"("customerId");

-- AddForeignKey
ALTER TABLE "CargoPackage" ADD CONSTRAINT "CargoPackage_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPhoto" ADD CONSTRAINT "CargoPhoto_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoStatusHistory" ADD CONSTRAINT "CargoStatusHistory_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceiving" ADD CONSTRAINT "ChinaReceiving_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarReceiving" ADD CONSTRAINT "DarReceiving_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerCargo" ADD CONSTRAINT "ContainerCargo_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerCargo" ADD CONSTRAINT "ContainerCargo_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_containerCargoId_fkey" FOREIGN KEY ("containerCargoId") REFERENCES "ContainerCargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionEvent" ADD CONSTRAINT "ExceptionEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ExceptionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupNote" ADD CONSTRAINT "PickupNote_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
