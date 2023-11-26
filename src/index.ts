import { Canister, ic, nat, Duration, query, StableBTreeMap, text, update, TimerId, Record, Variant, Result, Err, Ok, Vec, bool, int, Opt, Void } from 'azle';
import {v4 as uuidv4} from 'uuid';

const minStakeAmount = 1000;

const Participant = Record({
    id: text,
    name: text,
    areaOfStudy: text,
    isSupervisor: bool,
    hasStaked: bool,
  });

const ParticipantInfo = Record({
    name: text,
    areaOfStudy: text,
})

const Assignment = Record({
    id: text,
    topic: text,
    dueDate: nat,
})

const AssignmentInfo = Record({
    topic: text,
    dueDate: nat,
})

const StudentToSupervisorRecord = Record({
    id: text,
    studentId: text,
    supervisorId: text,
    assignmentId: text,
    isFinished: bool,
})

type Participant = typeof Participant;
type ParticipantInfo = typeof ParticipantInfo;
type Assignment = typeof Assignment;
type AssignmentInfo = typeof AssignmentInfo;
type StudentToSupervisorRecord = typeof StudentToSupervisorRecord;



const ParticipantError = Variant({
    IdDoesNotExistError: text,
    StakedIsTooLow: nat
  });

let participantStakeBalance = StableBTreeMap<text, nat>(text, nat, 0);
let idToParticipantRecord = StableBTreeMap<text, Participant>(text, Participant, 5);
let assignmentStorage = StableBTreeMap<text, Assignment>(text, Assignment, 2);
let progressStorage = StableBTreeMap<text, StudentToSupervisorRecord>(text, StudentToSupervisorRecord, 3);
let workUnderSupervison = StableBTreeMap<text, text>(text, text, 7);
let uploadedWork = StableBTreeMap<text, text>(text, text, 6);
let timerIdStorage = StableBTreeMap<text, TimerId>(text, TimerId, 8);

let supervisorList: Participant[] = [];

export default Canister({
    // student have to stake first before they submit any task on the platform
    stake: update([text, nat], Result(text, ParticipantError), (id, amountToStake)=>{
        const participantOpt = idToParticipantRecord.get(id);

        if('None' in participantOpt){
            return Err({
                IdDoesNotExistError: id
            });
        }

        if(amountToStake < minStakeAmount){
            return Err({
                StakedIsTooLow: amountToStake
            })
        }
        
        const participant: Participant = participantOpt.Some;
        participantStakeBalance.insert(id, amountToStake);
        
        const updatedParticipant: Participant = {
            ...participant,
            hasStaked: true
          };

        idToParticipantRecord.insert(updatedParticipant.id, updatedParticipant)

        if(updatedParticipant.isSupervisor){
            supervisorList.push(updatedParticipant);
        }

        return Ok(`${amountToStake} successfully staked by ${id}`);
    }),

    createStudent: update([ParticipantInfo], text, (info)=>{
        const student: Participant = {
            id: uuidv4(),
            isSupervisor: false,
            hasStaked: false,
            ...info
          };
          idToParticipantRecord.insert(student.id, student);
        return `Student: ${student.name}, ID: ${student.id}`;
    }),

    createSupervisor: update([ParticipantInfo], text, (info)=>{
        const supervisor: Participant = {
            id: uuidv4(),
            hasStaked: false,
            isSupervisor: true,
            ...info
        }
        idToParticipantRecord.insert(supervisor.id, supervisor);
        return `Supervisor: ${supervisor.name}, ID: ${supervisor.id}`;
    }),

    uploadAssignment: update([text, AssignmentInfo],Result(text, ParticipantError) , (studentId, assignmentInfo)=>{

        const participantOpt = idToParticipantRecord.get(studentId);
        if('None' in participantOpt){
            return Err({
                IdDoesNotExistError: studentId
            });
        }
        const student: Participant = participantOpt.Some;
        if(!student.hasStaked){
            throw new Error("You need to Stack some tokens first!");
        }

        const assignment: Assignment = {
            id: uuidv4(),
            ...assignmentInfo
        }
        
        const studentToSupervisorRecordId: text = linkStudentToSuperVisor(student, assignment);
        assignmentStorage.insert(assignment.id, assignment);
        const calcPeriod = assignment.dueDate * 24n * 60n * 60n;
        const dueDateId: TimerId = setDueDate(calcPeriod, student);
        timerIdStorage.insert(assignment.id, dueDateId);
        return Ok(`${studentToSupervisorRecordId}: Do not lose this Id. You will use it to claim your funds after finishing assignment. Use this assignentId to upload your work: ${assignment.id}`);
    }),

    uploadWorkToBeVerified: update([text, text], text, (assignmentId, workDone)=>{
        const assignmentOpt = assignmentStorage.get(assignmentId);
        if('None' in assignmentOpt){
            throw new Error(`No assignment with Id: ${assignmentId} found`);
        }
        uploadedWork.insert(assignmentId, workDone);
        return 'Your work is uploaded';
    }),

    viewTheWorkDone: query([text], text, (id)=>{
        const progressIdOpt = workUnderSupervison.get(id);
        if('None' in progressIdOpt){
            throw new Error(`Supervisor with ID: ${id} has no student to monitor`)
        }
        const progressId: text = progressIdOpt.Some;

        const workStructureOpt = progressStorage.get(progressId);
        if('None' in workStructureOpt){
            throw new Error(`Failed to get StudentToSupervisorRecord with ID: ${progressId}`)
        }
        const workStructure: StudentToSupervisorRecord = workStructureOpt.Some

        const workDoneOpt = uploadedWork.get(workStructure.assignmentId);
        if('None' in workDoneOpt){
            throw new Error(`Failed to load work done for the assignment with ID: ${workStructure.assignmentId}`);
            
        }
        const workDone: text = workDoneOpt.Some;
        return workDone;
    }),

    verifyWorkDone: update([text], Void, (id)=>{
        const progressIdOpt = workUnderSupervison.get(id);
        if('None' in progressIdOpt){
            throw new Error(`Supervisor with ID: ${id} has no student to monitor`)
        }
        const progressId: text = progressIdOpt.Some;

        const workStructureOpt = progressStorage.get(progressId);
        if('None' in workStructureOpt){
            throw new Error(`Failed to get StudentToSupervisorRecord with ID: ${progressId}`)
        }
        const workStructure: StudentToSupervisorRecord = workStructureOpt.Some

        const newWorkStructure: StudentToSupervisorRecord = {
            ...workStructure,
            isFinished: true, 
        }
        const assignmentId: text = newWorkStructure.assignmentId;

        const timerIdOpt = timerIdStorage.get(assignmentId);
        if('None' in timerIdOpt){
            throw new Error(`Failed to fetch timerId for the assignment with ID: ${assignmentId}`)
        }
        const timerId: TimerId = timerIdOpt.Some;
        ic.clearTimer(timerId);
    }),

    claimFunds: update([text, text], text, (studentId, specialId)=>{
        const progressCheckOpt = progressStorage.get(specialId);

        if('None' in progressCheckOpt){
            throw new Error("No work was in progress");
        }
        const progressCheck: StudentToSupervisorRecord = progressCheckOpt.Some;

        if(studentId !== progressCheck.studentId && !progressCheck.isFinished){
            throw new Error("You are not supposed to claim the funds");
        }

        const amount: nat = participantStakeBalance.get(progressCheck.studentId)
        participantStakeBalance.insert(progressCheck.studentId, 0n);
        const participantOpt = idToParticipantRecord.get(progressCheck.studentId);
        const participant: Participant = participantOpt.Some;
        const updatedParticipant: Participant = {
            ...participant,
            hasStaked: false
          };
        idToParticipantRecord.insert(updatedParticipant.id, updatedParticipant);

        return `Successfully withdrew ${amount.toString()} tokens`
    }),

    getParticipants: query([], Vec(Participant), ()=>{
        return idToParticipantRecord.values()
    }),

    getStudentName: query([text], Result(text, ParticipantError), (id)=>{
        const participantOpt = idToParticipantRecord.get(id);
        if('None' in participantOpt){
            return Err({
                IdDoesNotExistError: id
            });
        }

        const participant: Participant = participantOpt.Some
        if(participant.isSupervisor){
            return Ok('Not a Student');
        }
        return Ok(`Student Name: ${participant.name}`);
    }),

    getSupervisorList: query([], Vec(Participant), ()=>{
        return supervisorList;
    }),

    getAssignments: query([], Vec(StudentToSupervisorRecord), ()=>{
        return progressStorage.values();
    }),
});

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
   getRandomValues: () => {
       let array = new Uint8Array(32)
       for (let i = 0; i < array.length; i++) {
           array[i] = Math.floor(Math.random() * 256)
       }
       return array
   }
  }

function linkStudentToSuperVisor(student:Participant, assignment: Assignment): text {
    try {
    const supervisorIndex = randomInt(supervisorList.length-1, 0);
    const supervisor: Participant = supervisorList[supervisorIndex];

    const studentToSupervisor: StudentToSupervisorRecord = {
        id: uuidv4(),
        studentId: student.id,
        supervisorId: supervisor.id,
        assignmentId: assignment.id,
        isFinished: false,
    }
    progressStorage.insert(studentToSupervisor.id, studentToSupervisor);
    workUnderSupervison.insert(supervisor.id, studentToSupervisor.id)
    return studentToSupervisor.id;

    } catch (error) {
        throw new Error("failed to execute the code");
        
    }
}

const randomInt = (max: number, min: number): number =>
  Math.floor(Math.random() * (max - min) + 1) + min;

const setDueDate = (period: Duration, student: Participant): TimerId =>{
    return ic.setTimer(period, ()=>{
        participantStakeBalance.insert(student.id, 0n);
    });
}

