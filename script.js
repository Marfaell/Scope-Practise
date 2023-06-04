'use strict';

function calcAge(birthYear) {
  //function scope
  const age = 2037 - birthYear;
  // console.log(firstName);

  function printAge() {
    // function scope
    const output = `${firstName}, you are the ${age}, born in ${birthYear}`;
    console.log(output);

    if (birthYear <= 1981 && birthYear >= 1966) {
      var millenial = true;
      // creating NEW variable with the same name as the outer scope variable
      const firstName = 'Steven'; // example of the looking in the current scope first
      const str = `Oh, and you are a millenial, ${firstName}`;
      console.log(str);

      function add(a, b) {
        return a + b;
      }
      // output = 'NEW OUTPUT'; //reassigning outer scope's variable
    }
    // console.log(millenial); // example of var not working within block scope (it moves to previous function)
    // console.log(add(2, 3)); // example of function being block scoped in strict mode
  }
  printAge();

  return age;
}

const firstName = 'Jonas'; // This a global variable scope

calcAge(1980);
