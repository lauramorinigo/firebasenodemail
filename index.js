'use strict';

var firebase = require('firebase-admin');
var serviceAccount = require("FNodeServer-9b30bc0701e4.json");


var nodemailer = require('nodemailer');
var schedule   = require('node-schedule');
var Promise    = require('promise');
var escape     = require('escape-html');

var express = require("express");

var app = express();

app.use(express.static(__dirname ));

/*In case you want to have the logs via firebase*/

//firebase.database.enableLogging(true);


//In case you have special chars try this structure

 var mailTransport = nodemailer.createTransport( {
    host: "smtp.gmail.com", // hostname
    secureConnection: true, // use SSL
    port: 465, // port for secure SMTP
    auth: {
        user: "user@gmail.com",
        pass: "pass"
    }
});

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL:"https://URL.firebaseio.com"
})


app.get("index", function(req, res){
  res.sendFile('index.html');  // Start the server.
});



// [START single_value_read]
function sendNotificationToUser(uid, postId) {

  // Fetch the user's email.
  var userRef = firebase.database().ref('/users/' + uid);
  userRef.once('value').then(function(snapshot) {
    var email = snapshot.val().email;
    // Send the email to the user.
    // [START_EXCLUDE]
    if (email) {
      console.log('entra al mail');
      sendNotificationEmail(email).then(function() {
        // Save the date at which we sent that notification.
        // [START write_fan_out]
        var update = {};
        update['/posts/' + postId + '/lastNotificationTimestamp'] =
            firebase.database.ServerValue.TIMESTAMP;
        update['/user-posts/' + uid + '/' + postId + '/lastNotificationTimestamp'] =
            firebase.database.ServerValue.TIMESTAMP;
        firebase.database().ref().update(update);
        // [END write_fan_out]
      });
    }
    // [END_EXCLUDE]
  }).catch(function(error) {
    console.log('Failed to send notification to user:', error);
  });
}
// [END single_value_read]


/**
 * Send the new star notification email to the given email.
 */
function sendNotificationEmail(email) {

  var mailOptions = {
    from: '"Firebase Database Quickstart" <noreply@firebase.com>',
    to: email,
    subject: 'New star!',
    text: 'One of your posts has received a new star!'
  };
  return mailTransport.sendMail(mailOptions).then(function() {
    console.log('New star email notification sent to: ' + email);
  }
}

/**
 * Update the star count.
 */
// [START post_stars_transaction]
function updateStarCount(postRef) {

  postRef.transaction(function(post) {
    if (post) {
      post.starCount = post.stars ? Object.keys(post.stars).length : 0;
    }
    return post;
  });
}
// [END post_stars_transaction]

/**
 * Keep the likes count updated and send email notifications for new likes.
 */
function startListeners() {

  firebase.database().ref('/posts').on('child_added', function(postSnapshot) {
    var postReference = postSnapshot.ref;
    var uid = postSnapshot.val().uid;
    var postId = postSnapshot.key;
    console.log('si si');
    // Update the star count.
    // [START post_value_event_listener]
    postReference.child('stars').on('value', function(dataSnapshot) {

      updateStarCount(postReference);
      // [START_EXCLUDE]
      updateStarCount(firebase.database().ref('user-posts/' + uid + '/' + postId));
      // [END_EXCLUDE]
    }, function(error) {
      console.log('Failed to add "value" listener at /posts/' + postId + '/stars node:', error);
    });
    // [END post_value_event_listener]
    // Send email to author when a new star is received.
    // [START child_event_listener_recycler]
    postReference.child('stars').on('child_added', function(dataSnapshot) {
      sendNotificationToUser(uid, postId);
    }, function(error) {
      console.log('Failed to add "child_added" listener at /posts/' + postId + '/stars node:', error);
    });
    // [END child_event_listener_recycler]
  });
  console.log('New star notifier started...');
  console.log('Likes count updater started...');
}

/**
 * Send an email listing the top posts every Sunday.
 */
function startWeeklyTopPostEmailer() {
  // Run this job every Sunday at 2:30pm.
  schedule.scheduleJob({hour: 14, minute: 30, dayOfWeek: 0}, function () {
    // List the top 5 posts.
    // [START top_posts_query]
    var topPostsRef = firebase.database().ref('/posts').orderByChild('starCount').limitToLast(5);
    // [END top_posts_query]
    var allUserRef = firebase.database().ref('/users');
    Promise.all([topPostsRef.once('value'), allUserRef.once('value')]).then(function(resp) {
      var topPosts = resp[0].val();
      var allUsers = resp[1].val();
      var emailText = createWeeklyTopPostsEmailHtml(topPosts);
      sendWeeklyTopPostEmail(allUsers, emailText);
    }).catch(function(error) {
      console.log('Failed to start weekly top posts emailer:', error);
    });
  });
  console.log('Weekly top posts emailer started...');
}

/**
 * Sends the weekly top post email to all users in the given `users` object.
 */
function sendWeeklyTopPostEmail(users, emailHtml) {
  Object.keys(users).forEach(function(uid) {
    var user = users[uid];
    if (user.email) {
      var mailOptions = {
        from: '"Firebase Database Quickstart" <noreply@firebase.com>',
        to: user.email,
        subject: 'This week\'s top posts!',
        html: emailHtml
      };
      mailTransport.sendMail(mailOptions).then(function() {
        console.log('Weekly top posts email sent to: ' + user.email);
        // Save the date at which we sent the weekly email.
        // [START basic_write]
        return firebase.database().child('/users/' + uid + '/lastSentWeeklyTimestamp')
            .set(firebase.database.ServerValue.TIMESTAMP);
        // [END basic_write]
      }).catch(function(error) {
        console.log('Failed to send weekly top posts email:', error);
      });
    }
  });
}

/**
 * Creates the text for the weekly top posts email given an Object of top posts.
 */
function createWeeklyTopPostsEmailHtml(topPosts) {
  var emailHtml = '<h1>Here are this week\'s top posts:</h1>';
  Object.keys(topPosts).forEach(function(postId) {
    var post = topPosts[postId];
    emailHtml += '<h2>' + escape(post.title) + '</h2><div>Author: ' + escape(post.author) +
        '</div><div>Stars: ' + escape(post.starCount) + '</div><p>' + escape(post.body) + '</p>';
  });
  return emailHtml;
}

startListeners();
startWeeklyTopPostEmailer();


app.listen(8081, function () {
    console.log('listening on port 8081' );

});
