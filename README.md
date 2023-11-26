# ASSIGNMENT MONITORING

## About the project

Assignment monitoring project consist of a canister which helps students when managing their assignment by making sure that they do their work in time reducing the pressure of doing the assignment the last day of submition. In order to motivate the students to do their work in time, students have to stake minimum of 1000 tokens to do the assignent. After staking the tokens the Students can post the assignment which they want to do on the platform. The students need someone who is going to supervise them during the course of the assignment and the supervisor is randomly chosen from a pool of available supervisors.

Supervisors also have to stake some tokens in order for them to supervise the students so that they can give a fair judgement during accessment.

For anonimity only the IDs are going to be shared between the lectures and the students to improve fairness. No names of the supervisor or the students are going to be shared during the process

## How to run the project on your local machine

Firstly you need to install `dfx` and `node js` in your computer and the [Azle book](https://demergent-labs.github.io/azle/installation.html) provide good detail on the installation process.

- nb: Note that if you're using windows computer you need to install [wsl](https://www.youtube.com/watch?v=AMlaEFaKG88) in order to run bash commands on the terminal.

`dfx` is the tool you will use to interact with the IC locally and on mainnet. If you don't already have it installed:

After installing `nodejs` and `dfx` you need to clone the project into you local machine by ruuning the command

```bash
git clone https://github.com/sameicp/assignment-monitor
```

After cloning the repo move into the assignment-monitor director using the command

```bash
cd assignment-monitor
```

and run the following command to install the dependences

```bash
npm install
```

Next you will want to start a replica, which is a local instance of the IC that you can deploy your canisters to:

```bash
npm run replica_start
```

If you ever want to stop the replica:

```bash
npm run replica_stop
```

Now you can deploy your canister locally:

```bash
npm run canister_deploy_local
```

After you successfully deployed the canister you can interact with the platform using the web interface by clicking on the link provided.

Assuming you have [created a cycles wallet](https://internetcomputer.org/docs/current/developer-docs/quickstart/network-quickstart) and funded it with cycles, you can deploy to mainnet like this:

```bash
npm run canister_deploy_mainnet
```
