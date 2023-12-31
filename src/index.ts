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

    /////////////////////
    // Query functions //
    /////////////////////

    /**
     * Queries the canister to get the Students and Supervisors 
     * @return a list of the participants on the plaform
     */
    getParticipants: query([], Vec(Participant), ()=>{
        return idToParticipantRecord.values()
    }),

    /**
     * Queries the a student from the canister using student's id
     * @param id - the id of the student
     * @return Result with the name of the student or an error message
     */
    getStudentName: query([text], Result(text, ParticipantError), (id)=>{
        const participantOpt = idToParticipantRecord.get(id);
        if('None' in participantOpt){
            return Err({
                IdDoesNotExistError: id
            });
        }

        const participant: Participant = participantOpt.Some
        if(participant.isSupervisor){
            throw new Error('Not a Student');
        }
        return Ok(`Student Name: ${participant.name}`);
    }),

    /**
     * Queries a list of available supervisors on the platform
     * @return a list of registered supervisors.
     */
    getSupervisorList: query([], Vec(Participant), ()=>{
        return supervisorList;
    }),

    /**
     * Queries a list of already matched assignments on the platfrom
     * @return an objects which includes studentId, supervisorId, assignmentId and isFinished value
     */
    getProgress: query([], Vec(StudentToSupervisorRecord), ()=>{
        return progressStorage.values();
    }),

    /**
     * Supervisors uses their ID to view the work done by the student assigned to them
     * @param id - this is the id of the supervisor
     * @return - returns a text submited by the student else it results in an error
     */
    viewTheWorkDone: query([text], text, (id)=>{
        const progressIdOpt = workUnderSupervison.get(id);
        if('None' in progressIdOpt){
            throw new Error(`Supervisor with ID: ${id} has no student to monitor`)
        }
        const progressId: text = progressIdOpt.Some;

        const workStructureOpt = progressStorage.get(progressId);
        if('None' in workStructureOpt){
            throw new Error(`Failed to get progress with ID: ${progressId}`)
        }
        const workStructure: StudentToSupervisorRecord = workStructureOpt.Some

        const workDoneOpt = uploadedWork.get(workStructure.assignmentId);
        if('None' in workDoneOpt){
            throw new Error(`Failed to load work done for the assignment with ID: ${workStructure.assignmentId}`);
            
        }
        const workDone: text = workDoneOpt.Some;
        return workDone;
    }),

    //////////////////////
    // Update functions //
    //////////////////////

    /**
     * All participants on the platform need to stack in order to participate on the platform
     * @param id - Participant who want to stake some tokens
     * @param amountToStake - Amount of tokens the participants are willing to stake(minimum of 1000)
     * @return - A Result containing confirmation message or error message
     */
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

    /**
     * Register a student on the Platform
     * @param info - Details of the student registering
     * @return Confirmation that a student is registered successfully
     */
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

    /**
     * Register a supervisor on the Platform
     * @param info - Details of the supervisor registering
     * @return Confirmation that a supervisor is registered successfully
     */
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

    /**
     * Used by students to Upload their Assignments if they have staked
     * @param studentId - ID of the student who is uploading the assignment
     * @param assignmentInfo - Details of the assignment
     * @return Returns a confirmation message or error message
     */
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

    /**
     * Students can upload their work so that it can be verified by the Supervisors
     * @param assignentId - ID for the assignment for which they are uploading the solution
     * @param workDone - Text of the solution they have came up with for the solution
     * @return Confirmation message for success or an error message
     */
    uploadSolution: update([text, text], text, (assignmentId, workDone)=>{
        const assignmentOpt = assignmentStorage.get(assignmentId);
        if('None' in assignmentOpt){
            throw new Error(`No assignment with Id: ${assignmentId} found`);
        }
        uploadedWork.insert(assignmentId, workDone);
        return 'Your work is uploaded';
    }),

    /**
     * Supervisors can use this function verify that the student have done work
     * @param id - ID of the Supervisor
     * @return Void
     */
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

    /**
     * Used by the Students who have no tasks which is due to take back their tokens
     * @param studentId - ID of the Student whose claiming the tokens
     * @param specialId - ID used to retrieve a record of task the student has done
     * @return Sucess message or thow an error
     */
    claimFunds: update([text, text], text, (studentId, specialId)=>{
        const progressCheckOpt = progressStorage.get(specialId);

        if('None' in progressCheckOpt){
            throw new Error("Failed to find the assingment which you have done");
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

/**
 * 
 * @param student Student with the assignment 
 * @param assignment The tasks which the student has to do
 * @returns returns an ID which connect the student with the supervisor
 */
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
        throw new Error("failed to eStudents havent xecute the code");
        
    }
}

/**
 * generate a random number
 * @param max maximun number to reach when selecting a random number
 * @param min minimun number to start to randomly select from
 * @returns returns a number between min and max
 */
const randomInt = (max: number, min: number): number =>
  Math.floor(Math.random() * (max - min) + 1) + min;

/**
 * 
 * @param period duration of the assignment in days
 * @param student object of student 
 * @returns TimerId which can be used to stop the timer when the student finishes task
 */
const setDueDate = (period: Duration, student: Participant): TimerId =>{
    return ic.setTimer(period, ()=>{
        participantStakeBalance.insert(student.id, 0n);
    });
}

