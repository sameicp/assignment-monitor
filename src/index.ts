import {
  ic,
  nat,
  $query,
  StableBTreeMap,
  $update,
  TimerId,
  Record,
  Variant,
  Result,
  Vec,
  Opt,
  match,
  Duration,
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Participant = Record<{
  id: string;
  name: string;
  areaOfStudy: string;
  isSupervisor: boolean;
  hasStaked: boolean;
}>;

type ParticipantInfo = Record<{
  name: string;
  areaOfStudy: string;
}>;

type Assignment = Record<{
  id: string;
  topic: string;
  dueDate: nat;
}>;

type AssignmentInfo = Record<{
  topic: string;
  dueDate: nat;
}>;

type StudentToSupervisorRecord = Record<{
  id: string;
  studentId: string;
  supervisorId: string;
  assignmentId: string;
  isFinished: boolean;
}>;

type ParticipantError = Variant<{
  IdDoesNotExistError: string;
  StakedIsTooLow: nat;
}>;

const participantStakeBalance = new StableBTreeMap<string, nat>(0, 44, 1024);
const idToParticipantRecord = new StableBTreeMap<string, Participant>(1, 44, 1024);
const assignmentStorage = new StableBTreeMap<string, Assignment>(2, 44, 1024);
const progressStorage = new StableBTreeMap<string, StudentToSupervisorRecord>(3, 44, 1024);
const workUnderSupervison = new StableBTreeMap<string, string>(4, 44, 1024);
const uploadedWork = new StableBTreeMap<string, string>(5, 44, 1024);
const timerIdStorage = new StableBTreeMap<string, TimerId>(6, 44, 1024);

let supervisorList: Participant[] = [];

$query
export function getParticipants(): Result<Vec<Participant>, string> {
  try {
    return Result.Ok(idToParticipantRecord.values());
  } catch (error) {
    return Result.Err('Failed to get participants');
  }
}

$query
export function getStudentName(id: string): Result<string, ParticipantError> {

  // Validate ID
  if (!id) {
    return Result.Err({
      IdDoesNotExistError: 'Missing ID or Invalid ID',
    });
  }

  return match(idToParticipantRecord.get(id), {
    Some: (participant: Participant) => {
      if (participant.isSupervisor) {
        return Result.Err<string, ParticipantError>({
          IdDoesNotExistError: id,
        });
      }
      return Result.Ok<string, ParticipantError>(`Student Name: ${participant.name}`);
    },
    None: () =>
      Result.Err<string, ParticipantError>({
        IdDoesNotExistError: id,
      }),
  });
}

$query
export function getSupervisorList(): Result<Vec<Participant>, string> {
  try {
    return Result.Ok(supervisorList);
  } catch (error) {
    return Result.Err('Failed to get supervisor list');
  }
}

$query
export function getProgress(): Result<Vec<StudentToSupervisorRecord>, string> {
  try {
    return Result.Ok(progressStorage.values());
  } catch (error) {
    return Result.Err('Failed to get progress records');
  }
}

$query
export function viewTheWorkDone(id: string): Result<string, string> {
  // Validate ID
  if (!id) {
    return Result.Err<string, string>("Missing ID or Invalid ID");
  }
  const progressIdOpt = workUnderSupervison.get(id);

  return match(progressIdOpt, {
    None: () => Result.Err<string, string>(`Supervisor with ID: ${id} has no student to monitor`),
    Some: (progressId) => {
      const workStructureOpt = progressStorage.get(progressId);

      return match(workStructureOpt, {
        None: () => Result.Err<string, string>(`Failed to get progress with ID: ${progressId}`),
        Some: (workStructure) => {
          const workDoneOpt = uploadedWork.get(workStructure.assignmentId);

          return match(workDoneOpt, {
            None: () => Result.Err<string, string>(`Failed to load work done for the assignment with ID: ${workStructure.assignmentId}`),
            Some: (workDone) => Result.Ok<string, string>(workDone),
          });
        },
      });
    },
  });
}

$update
export function stake(id: string, amountToStake: nat): Result<string, ParticipantError> {
  // Validate ID
  if (!id) {
    return Result.Err({
      IdDoesNotExistError: 'Missing ID or Invalid ID',
    });
  }

  // Validate Amount
  if (amountToStake < 0) {
    return Result.Err({
      IdDoesNotExistError: 'Amount always greater than zero',
    });
  }


  const participantOpt = idToParticipantRecord.get(id);

  return match(participantOpt, {
    None: () => Result.Err<string, ParticipantError>({
      IdDoesNotExistError: id,
    }),
    Some: (participant) => {
      if (amountToStake < 0) {
        return Result.Err<string, ParticipantError>({
          StakedIsTooLow: amountToStake,
        });
      }

      participantStakeBalance.insert(id, amountToStake);

      const updatedParticipant: Participant = {
        ...participant,
        hasStaked: true,
      };

      idToParticipantRecord.insert(updatedParticipant.id, updatedParticipant);

      if (updatedParticipant.isSupervisor) {
        supervisorList.push(updatedParticipant);
      }

      return Result.Ok<string, ParticipantError>(`${amountToStake} successfully staked by ${id}`);
    },
  });
}

$update
export function createStudent(info: ParticipantInfo): Result<string, ParticipantError> {
  try {
    // Payload Validation
    if (!info.name || !info.areaOfStudy) {
      return Result.Err({
        IdDoesNotExistError: 'Missing required fields in payload',
      });
    }

    const student: Participant = {
      id: uuidv4(),
      isSupervisor: false,
      hasStaked: false,
      ...info,
    };
    idToParticipantRecord.insert(student.id, student);
    return Result.Ok(`Student: ${student.name}, ID: ${student.id}`);
  } catch (error) {
    return Result.Err({
      IdDoesNotExistError: 'An error occurred while creating the student',
    });
  }
}

$update
export function createSupervisor(info: ParticipantInfo): Result<string, ParticipantError> {
  try {
    // Payload Validation
    if (!info.name || !info.areaOfStudy) {
      return Result.Err({
        IdDoesNotExistError: 'Missing required fields in payload',
      });
    }

    const supervisor: Participant = {
      id: uuidv4(),
      hasStaked: false,
      isSupervisor: true,
      ...info,
    };
    idToParticipantRecord.insert(supervisor.id, supervisor);
    return Result.Ok(`Supervisor: ${supervisor.name}, ID: ${supervisor.id}`);
  } catch (error) {
    return Result.Err({
      IdDoesNotExistError: 'An error occurred while creating the supervisor',
    });
  }
}

$update
export function uploadSolution(assignmentId: string, workDone: string): Result<string, string> {
  // Validate ID
  if (!assignmentId) {
    return Result.Err<string, string>("Missing ID or Invalid ID");
  }
  if (!workDone) {
    return Result.Err<string, string>("Missing workDone parameter");
  }

  const result: Result<string, string> = match(assignmentStorage.get(assignmentId), {
    Some: (assignment) => {
      uploadedWork.insert(assignmentId, workDone);
      return Result.Ok<string, string>('Your work is uploaded');
    },
    None: () => Result.Err<string, string>(`No assignment with Id: ${assignmentId} found`),
  });

  return result;
}

$update
export function verifyWorkDone(id: string): Result<string, string> {
  // Validate ID
  if (!id) {
    return Result.Err<string, string>("Missing ID or Invalid ID");
  }

  const result = match(workUnderSupervison.get(id), {
    Some: (progressId: string) => {
      const workStructureOpt = progressStorage.get(progressId);
      return match(workStructureOpt, {
        Some: (workStructure: StudentToSupervisorRecord) => {
          const newWorkStructure: StudentToSupervisorRecord = {
            ...workStructure,
            isFinished: true,
          };
          progressStorage.insert(progressId, newWorkStructure);

          const assignmentId: string = newWorkStructure.assignmentId;
          const timerIdOpt = timerIdStorage.get(assignmentId);

          return match(timerIdOpt, {
            Some: (timerId: TimerId) => {
              ic.clearTimer(timerId);
              return Result.Ok<string, string>('Work verification successful');
            },
            None: () => Result.Err<string, string>('Failed to fetch timerId for the assignment'),
          });
        },
        None: () => Result.Err<string, string>(`Failed to get StudentToSupervisorRecord with ID: ${progressId}`),
      });
    },
    None: () => Result.Err<string, string>(`Supervisor with ID: ${id} has no student to monitor`),
  });

  return result;
}

$update
export function claimFunds(studentId: string, specialId: string): Result<string, string> {

  // Validate ID
  if (!studentId) {
    return Result.Err<string, string>("Missing ID or Invalid ID");
  }
  if (!specialId) {
    return Result.Err<string, string>("Missing ID or Invalid ID");
  }

  const result = match(progressStorage.get(specialId), {

    Some: (progressCheck) => {
      if (studentId !== progressCheck.studentId || !progressCheck.isFinished) {
        return Result.Err<string, string>("You are not supposed to claim the funds");
      }

      const amountOpt: Opt<bigint> = participantStakeBalance.get(progressCheck.studentId);
      const amount: bigint = match(amountOpt, {
        Some: (value) => value,
        None: () => 0n, // Default value if amount is not present
      });

      participantStakeBalance.insert(progressCheck.studentId, 0n);

      const participantOpt = idToParticipantRecord.get(progressCheck.studentId);
      return match(participantOpt, {
        Some: (participant) => {
          const updatedParticipant: Participant = {
            ...participant,
            hasStaked: false,
          };
          idToParticipantRecord.insert(updatedParticipant.id, updatedParticipant);
          return Result.Ok<string, string>(`Successfully withdrew ${amount.toString()} tokens`);
        },
        None: () => Result.Err<string, string>("Failed to find the participant"),
      });
    },
    None: () => Result.Err<string, string>("Failed to find the assignment which you have done"),
  });

  return result;
}

$update
export function uploadAssignment(studentId: string, assignmentInfo: AssignmentInfo): Result<string, ParticipantError> {
  // Validate ID
  if (!studentId) {
    return Result.Err({
      IdDoesNotExistError: 'Missing ID or Invalid ID',
    });
  }

  // Payload Validation
  if (!assignmentInfo.topic || !assignmentInfo.dueDate) {
    return Result.Err({
      IdDoesNotExistError: 'Missing required fields in payload',
    });
  }

  const result: Result<string, ParticipantError> = match(idToParticipantRecord.get(studentId), {
    Some: (student: Participant) => {
      if (!student.hasStaked) {
        return Result.Err<string, ParticipantError>({
          StakedIsTooLow: BigInt(0),
        });
      }

      const assignment: Assignment = {
        id: uuidv4(),
        ...assignmentInfo,
      };

      const studentToSupervisorRecordId: string = linkStudentToSuperVisor(student, assignment);
      assignmentStorage.insert(assignment.id, assignment);
      const calcPeriod = BigInt(assignment.dueDate) * 24n * 60n * 60n;
      const dueDateId: TimerId = setDueDate(calcPeriod, student);
      timerIdStorage.insert(assignment.id, dueDateId);

      return Result.Ok<string, ParticipantError>(`${studentToSupervisorRecordId}: Do not lose this Id. You will use it to claim your funds after finishing the assignment. Use this assignmentId to upload your work: ${assignment.id}`);
    },
    None: () => Result.Err<string, ParticipantError>({
      IdDoesNotExistError: studentId,
    }),
  });

  return result;
}

/**
 * @param student Student with the assignment
 * @param assignment The tasks which the student has to do
 * @returns returns an ID which connect the student with the supervisor
 */
function linkStudentToSuperVisor(student: Participant, assignment: Assignment): string {
  try {
    const supervisorIndex = randomInt(supervisorList.length - 1, 0);
    const supervisor: Participant = supervisorList[supervisorIndex];

    const studentToSupervisor: StudentToSupervisorRecord = {
      id: uuidv4(),
      studentId: student.id,
      supervisorId: supervisor.id,
      assignmentId: assignment.id,
      isFinished: false,
    };

    console.log('About to insert into progressStorage:', studentToSupervisor);

    progressStorage.insert(studentToSupervisor.id, studentToSupervisor);
    workUnderSupervison.insert(supervisor.id, studentToSupervisor.id);

    console.log('Inserted into progressStorage successfully.');

    return studentToSupervisor.id;
  } catch (error) {
    console.error('Error in linkStudentToSuperVisor:', error);
    throw new Error('Failed to execute the code');
  }
}

/**
 * generate a random number
 * @param max maximum number to reach when selecting a random number
 * @param min minimum number to start to randomly select from
 * @returns returns a number between min and max
 */
const randomInt = (max: number, min: number): number =>
  Math.floor(Math.random() * (max - min) + 1) + min;

/**
 * @param period duration of the assignment in days
 * @param student object of student
 * @returns TimerId which can be used to stop the timer when the student finishes task
 */
const setDueDate = (period: Duration, student: Participant): TimerId => {
  return ic.setTimer(period, () => {
    participantStakeBalance.insert(student.id, 0n);
  });
};

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  // @ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
};
