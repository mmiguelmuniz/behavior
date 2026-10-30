import { setGlobalOptions } from "firebase-functions/v2";
import { beforeUserCreated, beforeUserSignedIn } from "firebase-functions/v2/identity";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { REGION } from "./config";
import { assertCanSignIn } from "./auth";
import { createCollectiveLogs, createLog, deleteLog, listStudentLogs, myLogs, recomputeCounts, voidLog } from "./logs";
import { removeStudentPhoto, saveStudent, setStudentActive, setStudentPhoto } from "./students";
import { saveStaff, setStaffActive } from "./staff";
import { reportData } from "./reports";
import { sendFeedback, setFeedbackStatus } from "./feedback";

setGlobalOptions({ region: REGION, maxInstances: 10 });

// Blocking functions (exigem Identity Platform): só entra quem é @ear.com.br E está em staff/.
export const beforecreate = beforeUserCreated(async (event) => {
  await assertCanSignIn(event.data?.email, event.data?.emailVerified);
});
export const beforesignin = beforeUserSignedIn(async (event) => {
  await assertCanSignIn(event.data?.email, event.data?.emailVerified);
});

// Registros de comportamento (salvos na plataforma).
export const createlog = onCall(createLog);
export const liststudentlogs = onCall(listStudentLogs);
export const voidlog = onCall(voidLog);
export const deletelog = onCall(deleteLog);
export const mylogs = onCall(myLogs);
export const createcollectivelogs = onCall({ timeoutSeconds: 120 }, createCollectiveLogs);

// Gerenciar alunos e fotos (só ADMIN).
export const savestudent = onCall(saveStudent);
export const setstudentactive = onCall(setStudentActive);
export const setstudentphoto = onCall(setStudentPhoto);
export const removestudentphoto = onCall(removeStudentPhoto);

// Equipe (só ADMIN) e relatórios.
export const savestaff = onCall(saveStaff);
export const setstaffactive = onCall(setStaffActive);
export const reportdata = onCall({ timeoutSeconds: 120, memory: "512MiB" }, reportData);

// Feedback da equipe.
export const sendfeedback = onCall(sendFeedback);
export const setfeedbackstatus = onCall(setFeedbackStatus);

// Mantém contagens e totais em dia a cada log criado ou anulado.
export const onlogwritten = onDocumentWritten("logs/{logId}", async (event) => {
  const studentId = (event.data?.after?.get("studentId") ?? event.data?.before?.get("studentId")) as string | undefined;
  if (studentId) await recomputeCounts(studentId);
});