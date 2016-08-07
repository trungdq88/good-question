require('dotenv').config({silent: true});

// Initialize Firebase
var firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "good-question-52810.firebaseapp.com",
  databaseURL: "https://good-question-52810.firebaseio.com",
  storageBucket: "",
};

const fetch = require('node-fetch');
const Rx = require('rx');
const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: 'sandbox48f01f256473463db6872804212b4bc9.mailgun.org',
});
const firebase = require('firebase').initializeApp(firebaseConfig);

const RECEIVE_EMAIL = process.env.RECEIVE_EMAIL; // Fetch every X seconds
const FETCH_INTERVAL = 1000 * 60 * 60; // Fetch every 1 hour
const MAX_LENGTH = 1000; // Good questions are < 1000 chars
const API_QUESTIONS = 'https://api.stackexchange.com/2.2/questions?order=desc&sort=creation&site=stackoverflow&filter=withbody&tagged=javascript';

// Send email using Mail Gun
// @return an Observable
const notify= (question) => {
  return Rx.Observable.create(obs => {
    mailgun.messages().send({
      from: 'Good Question from SO <me@dinhquangtrung.net>',
      to: RECEIVE_EMAIL,
      subject: '[SO] ' + question.title,
      html: question.body + `<p><a href="${question.link}">Go to question</a></p>`,
    }, function (error, body) {
      if (!error) {
        obs.onNext(question);
        obs.onCompleted();
      } else {
        obs.onError(error);
      }
    });
  });
};

// Check if a question have been already sent before
// @return an Observable
const getQuestionStatus = (question) => {
  return Rx.Observable.create(obs => {
    firebase.database().ref(question.question_id).once('value', snapshot => {
      obs.onNext({ question, isSent: snapshot.val() });
      obs.onCompleted();
    }, error => obs.onError(error));
  });
};

// Check if a question have been already sent before
// @return an Observable
const setQuestionStatus = (question) => {
  return Rx.Observable.create(obs => {
    firebase.database().ref(question.question_id).set(question, () => {
      obs.onNext(question);
      obs.onCompleted();
    });
  });
};

// Subscribe to all StackOverflow questions tagged with "javascript" every xx seconds
Rx.Observable
  .interval(FETCH_INTERVAL)
  .startWith(1)
  .do(() => console.log(`Start ${new Date()}`))
  // Send request
  .flatMap(Rx.Observable.fromPromise(
    fetch(API_QUESTIONS).then(r => r.json()))
  )
  // Map to items array
  .flatMap(response => Rx.Observable.from(response.items))
  // Filter unanswered "good question"
  .filter(question => question.body.length < MAX_LENGTH && !question.is_answered)
  .flatMap(getQuestionStatus)
  // Filter the sent question
  .filter(status => !status.isSent)
  .map(status => status.question)
  // Notify me
  .flatMap(notify)
  // Set status as sent to prevent sending duplicate emails
  .flatMap(setQuestionStatus)
  .subscribe(
    question => console.log('Sent:', question.question_id),
    error => console.log(error)
  );
