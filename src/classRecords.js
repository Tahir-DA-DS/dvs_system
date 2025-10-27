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

// Create class record with same-day rule
router.post("/", async (req, res) => {
  try {
    const {
      tutorId,
      studentId,
      classLevel,
      subject,
      topic,
      startTime,
      endTime,
      comment,
    } = req.body;
    if (
      !tutorId ||
      !studentId ||
      !classLevel ||
      !subject ||
      !topic ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const tutor = await Tutor.findById(tutorId);
    const student = await Student.findById(studentId);
    if (!tutor || !student)
      return res.status(404).json({ message: "Tutor or Student not found" });

    if (!tutor.subjects.includes(subject)) {
      return res
        .status(400)
        .json({ message: "Selected subject is not in tutor's subjects" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid start or end time" });
    }
    if (end <= start)
      return res
        .status(400)
        .json({ message: "End time must be after start time" });

    // Same-day submission rule: submission date must equal lesson date
    const now = new Date();
    const lessonDate = dayjs(start).tz("Africa/Lagos").format("YYYY-MM-DD");
    const submitDate = dayjs(now).tz("Africa/Lagos").format("YYYY-MM-DD");
    if (lessonDate !== submitDate) {
      return res.status(400).json({
        message:
          "Class records must be submitted the same day as the lesson. Please use /late-submission endpoint for late submissions.",
      });
    }

    const paymentAmount = calculatePaymentAmount(classLevel, start, end);
    const record = await ClassRecord.create({
      tutorId,
      studentId,
      classLevel,
      subject,
      topic,
      startTime: start,
      endTime: end,
      dateSubmitted: now,
      paymentAmount,
      status: "Valid",
      comment,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List class records (optional filters)
router.get("/", async (req, res) => {
  const { tutorId, from, to } = req.query;
  const filter = {};
  if (tutorId) filter.tutorId = tutorId;
  if (from || to) {
    filter.dateSubmitted = {};
    if (from) filter.dateSubmitted.$gte = new Date(from);
    if (to) filter.dateSubmitted.$lte = new Date(to);
  }
  const records = await ClassRecord.find(filter)
    .populate("tutorId")
    .populate("studentId")
    .sort({ dateSubmitted: -1 });
  res.json(records);
});

router.post("/late-submission", async (req, res) => {
  try {
    const {
      tutorId,
      studentId,
      classLevel,
      subject,
      topic,
      startTime,
      endTime,
      comment,
      reason,
    } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Reason for late submission required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid start or end time" });
    }

    const paymentAmount = calculatePaymentAmount(classLevel, start, end);
    const record = await ClassRecord.create({
      tutorId,
      studentId,
      classLevel,
      subject,
      topic,
      startTime: start,
      endTime: end,
      dateSubmitted: new Date(),
      paymentAmount,
      status: "Pending Approval",
      approvalRequest: {
        reason,
        requestDate: new Date(),
      },
      comment,
    });

    res.status(201).json(record);
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ message: "An error occurred while processing your request." });
  }
});

router.patch("/:recordId/approve", async (req, res) => {
  try {
    const { adminId, approved } = req.body;
    const record = await ClassRecord.findById(req.params.recordId);

    if (!record) return res.status(404).json({ message: "Record not found" });
    if (record.status !== "Pending Approval") {
      return res
        .status(400)
        .json({ message: "Record is not pending approval" });
    }

    record.status = approved ? "Approved" : "Rejected";
    record.approvalRequest.approvedBy = adminId;
    record.approvalRequest.approvalDate = new Date();
    await record.save();

    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
