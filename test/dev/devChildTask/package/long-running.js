const onSignal = (signal) => {
  console.log(`     ${signal}...`);
  setTimeout(() => {
    console.log("     done.");
    process.exit(0);
  }, 100);
};

process.once("SIGTERM", onSignal);
process.once("SIGINT", onSignal);

setTimeout(() => {
  console.log("long running terminated");
  process.exitCode = 9;
}, 4000);
