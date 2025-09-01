-- CreateIndex
ALTER TABLE "flight_tracking" ADD COLUMN "tripId" TEXT;

-- CreateIndex
CREATE INDEX "flight_tracking_tripId_idx" ON "flight_tracking"("tripId");
