import { Router } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  ClassRecord,
  Tutor,
  Student,
  calculatePaymentAmount,
} from "./models.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const router = Router();

// ── Create class record (same-day) ──
router.post("/", async (req, res) => {
  try {
    const { tutorId, studentId, classLevel, subject, topic, startTime, endTime, comment } = req.body;

    if (!tutorId || !studentId || !classLevel || !subject || !topic || !startTime || !endTime)
      return res.status(400).json({ message: "Missing required fields" });

    const tutor = await Tutor.findById(tutorId);
    const student = await Student.findById(studentId);
    if (!tutor || !student)
      return res.status(404).json({ message: "Tutor or Student not found" });

    if (!tutor.subjects.includes(subject))
      return res.status(400).json({ message: "Selected subject is not in tutor's subjects" });

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: "Invalid start or end time" });

    if (end <= start)
      return res.status(400).json({ message: "End time must be after start time" });

    const durationMinutes = (end - start) / (1000 * 60);
    const allowedDurations = [30, 60, 90, 120];
    if (!allowedDurations.some(d => Math.abs(durationMinutes - d) <= 1))
      return res.status(400).json({ message: "Class duration must be 30 minutes, 1 hour, 1 hour 30 minutes, or 2 hours." });

    const overlapping = await ClassRecord.findOne({
      tutorId, studentId, subject,
      $or: [{ startTime: { $lt: end }, endTime: { $gt: start } }],
    });
    if (overlapping)
      return res.status(400).json({ message: "Duplicate or overlapping class record already exists." });

    const now = new Date();
    const lessonDate = dayjs(start).tz("Africa/Lagos").format("YYYY-MM-DD");
    const submitDate = dayjs(now).tz("Africa/Lagos").format("YYYY-MM-DD");
    if (lessonDate !== submitDate)
      return res.status(400).json({ message: "Class records must be submitted the same day as the lesson. Please use /late-submission for late submissions." });

    const paymentAmount = calculatePaymentAmount(classLevel, subject, start, end);
    const record = await ClassRecord.create({
      tutorId, studentId, classLevel, subject, topic,
      startTime: start, endTime: end,
      dateSubmitted: now, paymentAmount,
      status: "Valid", comment,
    });

    res.status(201).json({ message: "Class record created successfully", recordId: record._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ── List class records with filters ──
router.get("/", async (req, res) => {
  try {
    const { tutorId, studentId, classLevel, from, to } = req.query;
    const filter = {};

    if (tutorId) filter.tutorId = tutorId;
    if (studentId) filter.studentId = studentId;
    if (classLevel) filter.classLevel = classLevel;

    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.startTime.$lte = endDate;
      }
    }

    console.log("Applying filters:", filter);
    const records = await ClassRecord.find(filter)
      .populate("tutorId")
      .populate("studentId")
      .sort({ startTime: -1 });

    console.log("Found records:", records.length);
    res.json(records);
  } catch (err) {
    console.error("GET /class-records error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ── Late submission ──
router.post("/late-submission", async (req, res) => {
  try {
    const { tutorId, studentId, classLevel, subject, topic, startTime, endTime, comment, reason } = req.body;

    if (!tutorId || !studentId || !classLevel || !subject || !topic || !startTime || !endTime)
      return res.status(400).json({ message: "Missing required fields" });

    if (!reason)
      return res.status(400).json({ message: "Reason for late submission required" });

    const tutor = await Tutor.findById(tutorId);
    const student = await Student.findById(studentId);
    if (!tutor || !student)
      return res.status(404).json({ message: "Tutor or Student not found" });

    if (!tutor.subjects.includes(subject))
      return res.status(400).json({ message: "Selected subject is not in tutor's subjects" });

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ message: "Invalid start or end time" });

    if (end <= start)
      return res.status(400).json({ message: "End time must be after start time" });

    const durationMinutes = (end - start) / (1000 * 60);
    const allowedDurations = [30, 60, 90, 120];
    if (!allowedDurations.some(d => Math.abs(durationMinutes - d) <= 1))
      return res.status(400).json({ message: "Class duration must be 30 minutes, 1 hour, 1 hour 30 minutes, or 2 hours." });

    const overlapping = await ClassRecord.findOne({
      tutorId, studentId, subject,
      $or: [{ startTime: { $lt: end }, endTime: { $gt: start } }],
    });
    if (overlapping)
      return res.status(400).json({ message: "Duplicate or overlapping class record already exists." });

    const paymentAmount = calculatePaymentAmount(classLevel, subject, start, end);
    const record = await ClassRecord.create({
      tutorId, studentId, classLevel, subject, topic,
      startTime: start, endTime: end,
      dateSubmitted: new Date(), paymentAmount,
      status: "Pending Approval",
      approvalRequest: { reason, requestDate: new Date() },
      comment,
    });

    res.status(201).json({
      message: "Late class record submitted successfully. Awaiting admin approval.",
      recordId: record._id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An error occurred while processing your request." });
  }
});

// ── Get pending records ──
router.get("/pending", async (req, res) => {
  try {
    const records = await ClassRecord.find({ status: "Pending Approval" })
      .populate("tutorId")
      .populate("studentId")
      .sort({ dateSubmitted: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Bulk delete ──
router.delete("/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ message: "No records specified for deletion" });
    const result = await ClassRecord.deleteMany({ _id: { $in: ids } });
    res.json({ message: `${result.deletedCount} records deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Approve/reject pending record ──
router.patch("/:id/approve", async (req, res) => {
  try {
    const { approved, adminId } = req.body;
    const record = await ClassRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });
    if (record.status !== "Pending Approval")
      return res.status(400).json({ message: "Record is not pending approval" });
    record.status = approved ? "Approved" : "Rejected";
    record.approvalRequest.approvedBy = adminId;
    record.approvalRequest.approvalDate = new Date();
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get single record ──
router.get("/:id", async (req, res) => {
  try {
    const record = await ClassRecord.findById(req.params.id)
      .populate("tutorId")
      .populate("studentId");
    if (!record) return res.status(404).json({ message: "Record not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Delete single record ──
router.delete("/:id", async (req, res) => {
  try {
    const record = await ClassRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });
    await record.deleteOne();
    res.json({ message: "Record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update record ──
router.put("/:id", async (req, res) => {
  try {
    const { tutorId, studentId, classLevel, subject, topic, startTime, endTime, comment } = req.body;
    const record = await ClassRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });

    const tutor = await Tutor.findById(tutorId);
    const student = await Student.findById(studentId);
    if (!tutor || !student)
      return res.status(404).json({ message: "Tutor or Student not found" });

    if (!tutor.subjects.includes(subject))
      return res.status(400).json({ message: "Selected subject is not in tutor's subjects" });

    const paymentAmount = calculatePaymentAmount(classLevel, subject, new Date(startTime), new Date(endTime));

    Object.assign(record, {
      tutorId, studentId, classLevel, subject, topic,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      paymentAmount, comment,
    });

    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;